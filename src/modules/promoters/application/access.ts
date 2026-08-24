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
  const [{ data, error }, { data: tableData, error: tableError }] = await Promise.all([
    admin.rpc("get_promoter_dashboard", { target_session_hash: sessionHash }),
    admin.rpc("get_promoter_table_dashboard", { target_session_hash: sessionHash }),
  ]);
  if (error || tableError) throw new Error("PROMOTER_DASHBOARD_UNAVAILABLE");
  const tableByRelation = new Map((tableData ?? []).map((row) => [row.event_promoter_id, row]));
  return (data ?? []).map((row) => {
    const table = tableByRelation.get(row.event_promoter_id) ?? { tables_sold: 0, table_revenue: 0 };
    return { ...row, tickets_sold: Math.max(0, row.tickets_sold - table.tables_sold), ticket_revenue: Math.max(0, row.ticket_revenue - table.table_revenue), total_revenue: row.ticket_revenue, tables_sold: table.tables_sold, table_revenue: table.table_revenue };
  });
}

export async function getPromoterEventDashboard(sessionHash: string, eventPromoterId: string) {
  const admin = createAdminClient();
  await admin.rpc("reconcile_promoter_session_commissions", { target_session_hash: sessionHash });
  const [{ data, error }, { data: tableData, error: tableError }] = await Promise.all([
    admin.rpc("get_promoter_event_dashboard", { target_session_hash: sessionHash, target_event_promoter: eventPromoterId }),
    admin.rpc("get_promoter_event_table_dashboard", { target_session_hash: sessionHash, target_event_promoter: eventPromoterId }),
  ]);
  if (error || tableError) throw new Error("PROMOTER_DASHBOARD_UNAVAILABLE");
  const row = data?.[0];
  if (!row) return null;
  const table = tableData?.[0] ?? { tables_sold: 0, table_revenue: 0, table_breakdown: [] };
  return { ...row, tickets_sold: Math.max(0, row.tickets_sold - table.tables_sold), ticket_revenue: Math.max(0, row.ticket_revenue - table.table_revenue), total_revenue: row.ticket_revenue, tables_sold: table.tables_sold, table_revenue: table.table_revenue, table_breakdown: table.table_breakdown };
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
