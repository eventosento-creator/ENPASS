import "server-only";

import { createClient } from "@/shared/database/server";
import { generateOpaqueToken, hashOpaqueToken } from "@/modules/ticketing/domain/credentials";
import { SmtpEmailProvider } from "@/modules/ticketing/infrastructure/smtp-email-provider";
import type { EventCollaborator } from "../domain/collaborator";

export async function inviteEventCollaborator(eventId: string, email: string) {
  const supabase = await createClient();
  const [{ data: event }, { data: { user } }] = await Promise.all([
    supabase.from("events").select("name, organization_id").eq("id", eventId).single(),
    supabase.auth.getUser(),
  ]);
  if (!event) throw new Error("EVENT_NOT_ALLOWED");
  const inviterName = typeof user?.user_metadata.full_name === "string" && user.user_metadata.full_name.trim()
    ? user.user_metadata.full_name.trim() : (user?.email ?? "Un organizador");

  const rawToken = generateOpaqueToken();
  const { error } = await supabase.rpc("create_event_collaborator_invitation", {
    target_event: eventId,
    target_email: email,
    target_token_hash: hashOpaqueToken(rawToken),
  });
  if (error) throw new Error("COLLABORATOR_INVITE_CREATE_FAILED");

  const acceptUrl = new URL("/invite/aceptar", appUrl());
  acceptUrl.searchParams.set("token", rawToken);
  try {
    await new SmtpEmailProvider().sendCollaboratorInvite({
      to: email,
      eventName: event.name,
      inviterName,
      acceptUrl: acceptUrl.toString(),
    });
  } catch {
    // La invitación queda creada igual; el organizador puede reenviarla.
  }
  return { acceptUrl: acceptUrl.toString() };
}

export async function acceptEventCollaboratorInvitation(rawToken: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_event_collaborator_invitation", {
    raw_token_hash: hashOpaqueToken(rawToken),
  });
  if (error || !data) return null;
  return data;
}

export async function removeEventCollaborator(eventId: string, userId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_event_collaborator", { target_event: eventId, target_user: userId });
  if (error) throw new Error("COLLABORATOR_REMOVE_FAILED");
}

export async function getEventCollaborators(eventId: string): Promise<EventCollaborator[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_event_collaborators", { target_event: eventId });
  if (error || !data) return [];
  return data.map((row) => ({ id: row.collaborator_id, userId: row.user_id, email: row.email, createdAt: row.created_at }));
}

function appUrl() {
  const value = process.env.APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  if (!value) throw new Error("APP_URL_NOT_CONFIGURED");
  return value;
}
