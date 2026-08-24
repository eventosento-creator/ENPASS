import "server-only";

import { cache } from "react";
import { createAdminClient } from "@/shared/database/admin";
import { createClient } from "@/shared/database/server";
import { generateOpaqueToken, hashOpaqueToken } from "@/modules/ticketing/domain/credentials";
import { SmtpEmailProvider } from "@/modules/ticketing/infrastructure/smtp-email-provider";
import { promoterLog } from "@/shared/lib/structured-log";
import { PROMOTER_INVITE_MAX_AGE_SECONDS, PROMOTER_SESSION_MAX_AGE_SECONDS } from "../domain/session";

export async function createPromoterInvitation(eventPromoterId: string, sendEmail: boolean) {
  const supabase = await createClient();
  const { data: relation, error: relationError } = await supabase.from("event_promoters")
    .select("id, organization_id, event_id, promoter_id")
    .eq("id", eventPromoterId)
    .single();
  if (relationError || !relation) throw new Error("PROMOTER_NOT_ALLOWED");

  const [{ data: promoter }, { data: event }] = await Promise.all([
    supabase.from("promoters").select("display_name, email").eq("id", relation.promoter_id).single(),
    supabase.from("events").select("name").eq("id", relation.event_id).single(),
  ]);
  if (!promoter || !event) throw new Error("PROMOTER_CONTEXT_INCOMPLETE");

  const rawToken = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + PROMOTER_INVITE_MAX_AGE_SECONDS * 1_000);
  const { error } = await supabase.rpc("create_promoter_access_token", {
    target_event_promoter: eventPromoterId,
    target_token_hash: hashOpaqueToken(rawToken),
    target_expires_at: expiresAt.toISOString(),
  });
  if (error) throw new Error("PROMOTER_INVITE_CREATE_FAILED");

  const accessUrl = new URL("/promoter/access", appUrl());
  accessUrl.searchParams.set("token", rawToken);
  let emailSent = false;
  if (sendEmail && promoter.email) {
    try {
      await new SmtpEmailProvider().sendPromoterInvite({
        to: promoter.email,
        promoterName: promoter.display_name,
        eventName: event.name,
        accessUrl: accessUrl.toString(),
      });
      await createAdminClient().from("audit_logs").insert({
        organization_id: relation.organization_id,
        action: "promoter.invite.sent",
        entity_type: "promoter",
        entity_id: relation.promoter_id,
        after_data: { event_promoter_id: relation.id },
      });
      promoterLog("promoter.invite.sent", { eventPromoterId: relation.id });
      emailSent = true;
    } catch {
      promoterLog("promoter.invite.sent", { eventPromoterId: relation.id, failed: true });
    }
  }
  return { accessUrl: accessUrl.toString(), emailSent };
}

export async function exchangePromoterAccessToken(rawToken: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(rawToken)) return null;
  const rawSession = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + PROMOTER_SESSION_MAX_AGE_SECONDS * 1_000);
  const { data, error } = await createAdminClient().rpc("exchange_promoter_access_token", {
    target_token_hash: hashOpaqueToken(rawToken),
    target_session_hash: hashOpaqueToken(rawSession),
    target_session_expires_at: expiresAt.toISOString(),
  });
  if (error || !data) return null;
  promoterLog("promoter.access.granted");
  return { rawSession, expiresAt };
}

export const getCurrentPromoterSession = cache(async (sessionHash: string | null) => {
  if (!sessionHash) return null;
  const { data, error } = await createAdminClient().rpc("get_promoter_session", { target_session_hash: sessionHash });
  if (error) return null;
  return data?.[0] ?? null;
});

export async function getPromoterDashboard(sessionHash: string) {
  const admin = createAdminClient();
  await admin.rpc("reconcile_promoter_session_commissions", { target_session_hash: sessionHash });
  const { data, error } = await admin.rpc("get_promoter_dashboard", { target_session_hash: sessionHash });
  if (error) throw new Error("PROMOTER_DASHBOARD_UNAVAILABLE");
  return data ?? [];
}

export async function getPromoterEventDashboard(sessionHash: string, eventPromoterId: string) {
  const admin = createAdminClient();
  await admin.rpc("reconcile_promoter_session_commissions", { target_session_hash: sessionHash });
  const { data, error } = await admin.rpc("get_promoter_event_dashboard", {
    target_session_hash: sessionHash,
    target_event_promoter: eventPromoterId,
  });
  if (error) throw new Error("PROMOTER_DASHBOARD_UNAVAILABLE");
  return data?.[0] ?? null;
}

export async function revokePromoterSession(sessionHash: string | null) {
  if (!sessionHash) return;
  await createAdminClient().rpc("revoke_promoter_session", { target_session_hash: sessionHash });
}

function appUrl() {
  const value = process.env.APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  if (!value) throw new Error("APP_URL_NOT_CONFIGURED");
  return value;
}
