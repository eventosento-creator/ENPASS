import "server-only";

import { createClient } from "@/shared/database/server";
import { generateOpaqueToken, hashOpaqueToken } from "@/modules/ticketing/domain/credentials";
import { SmtpEmailProvider } from "@/modules/ticketing/infrastructure/smtp-email-provider";

export type ClubTeamEntry = { kind: "member" | "invitation"; id: string; email: string; createdAt: string };

export async function getClubTeam(organizationId: string): Promise<ClubTeamEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_club_team", { target_org: organizationId });
  if (error || !data) return [];
  return data.map((row) => ({ kind: row.kind as "member" | "invitation", id: row.ref_id, email: row.email, createdAt: row.created_at }));
}

function appUrl() {
  const value = process.env.APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  if (!value) throw new Error("APP_URL_NOT_CONFIGURED");
  return value;
}

export async function inviteClubStaff(organizationId: string, email: string) {
  const supabase = await createClient();
  const [{ data: organization }, { data: { user } }] = await Promise.all([
    supabase.from("organizations").select("name").eq("id", organizationId).single(),
    supabase.auth.getUser(),
  ]);
  if (!organization) throw new Error("CLUB_NOT_ALLOWED");
  const inviterName = typeof user?.user_metadata.full_name === "string" && user.user_metadata.full_name.trim() ? user.user_metadata.full_name.trim() : (user?.email ?? "El club");
  const rawToken = generateOpaqueToken();
  const { error } = await supabase.rpc("create_club_staff_invitation", { target_org: organizationId, target_email: email, target_token_hash: hashOpaqueToken(rawToken) });
  if (error) throw new Error("CLUB_INVITE_FAILED");
  const acceptUrl = new URL("/invite/club", appUrl());
  acceptUrl.searchParams.set("token", rawToken);
  let emailSent = false;
  try {
    await new SmtpEmailProvider().sendClubStaffInvite({ to: email, clubName: organization.name, inviterName, acceptUrl: acceptUrl.toString() });
    emailSent = true;
  } catch { /* se devuelve el link para mandarlo a mano */ }
  return { acceptUrl: acceptUrl.toString(), emailSent };
}

export async function acceptClubStaffInvitation(rawToken: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_club_staff_invitation", { raw_token_hash: hashOpaqueToken(rawToken) });
  return error || !data ? null : data;
}
