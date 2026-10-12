import "server-only";

import { createClient } from "@/shared/database/server";
import type { Promotion } from "@/shared/database/types";

export type PromotionFilters = { eventId?: string; from?: string; to?: string; status?: string; search?: string };

export async function getPromotionsOverview(organizationId: string, filters: PromotionFilters = {}) {
  const supabase = await createClient();
  const args = { target_org: organizationId, target_event: filters.eventId || null, target_from: filters.from || null, target_to: filters.to || null };
  const [{ data: rows }, { data: summary }] = await Promise.all([supabase.rpc("get_promotions_overview", args), supabase.rpc("get_promotions_summary", args)]);
  const search = filters.search?.trim().toLowerCase();
  const filtered = (rows ?? []).filter((row) => (!filters.status || row.status === filters.status) && (!search || row.code.toLowerCase().includes(search) || row.name.toLowerCase().includes(search)));
  return { rows: filtered, summary: summary?.[0] ?? { active_promotions: 0, uses_confirmed: 0, tickets_benefited: 0, discount_amount: 0, sales_amount: 0, buyers: 0 }, hasAny: (rows ?? []).length > 0 };
}

export async function getPromotion(organizationId: string, id: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("promotions").select("*").eq("id", id).eq("organization_id", organizationId).maybeSingle();
  if (!data) return null;
  const [{ data: events }, { data: ticketTypes }] = await Promise.all([
    supabase.from("promotion_events").select("event_id").eq("promotion_id", id),
    supabase.from("promotion_ticket_types").select("ticket_type_id").eq("promotion_id", id),
  ]);
  return { promotion: data as Promotion, eventIds: (events ?? []).map((row) => row.event_id), ticketTypeIds: (ticketTypes ?? []).map((row) => row.ticket_type_id) };
}

export async function getPromotionOverviewRow(organizationId: string, id: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_promotions_overview", { target_org: organizationId });
  return (data ?? []).find((row) => row.id === id) ?? null;
}

export async function getPromotionTimeline(organizationId: string, id: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_promotion_timeline", { target_org: organizationId, target_promotion: id });
  return data ?? [];
}

export async function listPromotionRedemptions(organizationId: string, options: { promotionId?: string; status?: string; limit?: number } = {}) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("list_promotion_redemptions", {
    target_org: organizationId, target_promotion: options.promotionId ?? null, target_status: options.status || null, target_limit: options.limit ?? 200,
  });
  return data ?? [];
}

/** Eventos de la organización con sus entradas, para elegir el alcance de una promoción. */
export async function getPromotionScopeOptions(organizationId: string) {
  const supabase = await createClient();
  const [{ data: events }, { data: ticketTypes }] = await Promise.all([
    supabase.from("events").select("id, name, starts_at, status, currency").eq("organization_id", organizationId).neq("status", "cancelled").order("starts_at", { ascending: false }),
    supabase.from("ticket_types").select("id, event_id, name, price_amount").eq("organization_id", organizationId).eq("active", true).order("sort_order"),
  ]);
  return {
    events: events ?? [],
    ticketTypes: (ticketTypes ?? []).map((type) => ({ id: type.id, eventId: type.event_id, name: type.name, price: type.price_amount })),
  };
}
