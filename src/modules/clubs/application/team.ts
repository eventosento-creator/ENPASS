import "server-only";

import { createClient } from "@/shared/database/server";
import { generateOpaqueToken, hashOpaqueToken } from "@/modules/ticketing/domain/credentials";
import { collaboratorLog } from "@/shared/lib/structured-log";
import { SmtpEmailProvider } from "@/modules/ticketing/infrastructure/smtp-email-provider";

export type ClubTeamEntry = { kind: "member" | "invitation"; id: string; email: string; createdAt: string; title: string | null };

export async function getClubTeam(organizationId: string): Promise<ClubTeamEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_club_team", { target_org: organizationId });
  if (error || !data) return [];
  return data.map((row) => ({ kind: row.kind as "member" | "invitation", id: row.ref_id, email: row.email, createdAt: row.created_at, title: row.title }));
}

function appUrl() {
  const value = process.env.APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  if (!value) throw new Error("APP_URL_NOT_CONFIGURED");
  return value;
}

export async function inviteClubStaff(organizationId: string, email: string, title?: string) {
  const supabase = await createClient();
  const [{ data: organization }, { data: { user } }] = await Promise.all([
    supabase.from("organizations").select("name").eq("id", organizationId).single(),
    supabase.auth.getUser(),
  ]);
  if (!organization) throw new Error("CLUB_NOT_ALLOWED");
  const inviterName = typeof user?.user_metadata.full_name === "string" && user.user_metadata.full_name.trim() ? user.user_metadata.full_name.trim() : (user?.email ?? "El club");
  const rawToken = generateOpaqueToken();
  const { error } = await supabase.rpc("create_club_staff_invitation", { target_org: organizationId, target_email: email, target_token_hash: hashOpaqueToken(rawToken), target_title: title?.trim() || null });
  if (error) { collaboratorLog("club_staff.invite.created", { failed: true, code: error.code ?? "", message: error.message }); throw new Error("CLUB_INVITE_FAILED"); }
  collaboratorLog("club_staff.invite.created", { organizationId });
  const acceptUrl = new URL("/invite/club", appUrl());
  acceptUrl.searchParams.set("token", rawToken);
  let emailSent = false;
  try {
    await new SmtpEmailProvider().sendClubStaffInvite({ to: email, clubName: organization.name, inviterName, acceptUrl: acceptUrl.toString() });
    emailSent = true;
    collaboratorLog("club_staff.invite.email_sent", { organizationId });
  } catch (sendError) {
    // Se devuelve el link para mandarlo a mano; el motivo queda en los logs del servidor.
    collaboratorLog("club_staff.invite.email_failed", { organizationId, message: sendError instanceof Error ? sendError.message : String(sendError) });
  }
  return { acceptUrl: acceptUrl.toString(), emailSent };
}

export async function acceptClubStaffInvitation(rawToken: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_club_staff_invitation", { raw_token_hash: hashOpaqueToken(rawToken) });
  return error || !data ? null : data;
}
