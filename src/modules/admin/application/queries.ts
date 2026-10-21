import "server-only";

import { notFound } from "next/navigation";
import { createClient } from "@/shared/database/server";
import { isPlatformAdmin } from "@/modules/organizations/application/queries";

export type AdminPeriod = "hoy" | "7d" | "mes";
export const adminPeriods: { value: AdminPeriod; label: string }[] = [{ value: "hoy", label: "Hoy" }, { value: "7d", label: "7 días" }, { value: "mes", label: "Este mes" }];

const AR_OFFSET_MS = 3 * 3600_000;

/** Rango [desde, hasta) en hora de Argentina (UTC-3, sin horario de verano). */
export function periodRange(period: AdminPeriod, now = new Date()) {
  const arNow = new Date(now.getTime() - AR_OFFSET_MS);
  const startOfDay = Date.UTC(arNow.getUTCFullYear(), arNow.getUTCMonth(), arNow.getUTCDate()) + AR_OFFSET_MS;
  const startOfMonth = Date.UTC(arNow.getUTCFullYear(), arNow.getUTCMonth(), 1) + AR_OFFSET_MS;
  const from = period === "hoy" ? startOfDay : period === "7d" ? now.getTime() - 7 * 24 * 3600_000 : startOfMonth;
  return { from: new Date(from).toISOString(), to: now.toISOString() };
}

export function parsePeriod(value: string | undefined): AdminPeriod {
  return value === "hoy" || value === "7d" ? value : "mes";
}

export type AdminOverview = {
  sales: number; sales_prev: number; fees: number; orders: number; tickets: number; events_in_period: number; active_events: number;
  owed_total: number; owed_orgs: number;
  actions: { transfers_review: number; listings_pending: number; payouts_to_pay: number; payouts_ready: number; conflicts: number };
  methods: { method: "mercado_pago" | "transferencia" | "caja"; amount: number }[];
  clubs: { count: number; members: number; overdue_members: number };
  upcoming: { id: string; name: string; starts_at: string; capacity: number; organization_name: string; sold: number }[];
};

export type AdminEventDetail = {
  event: { id: string; name: string; slug: string; status: string; starts_at: string; capacity: number; organization_id: string; organization_name: string; service_fee_bps: number; is_club: boolean };
  sales: number; fees: number; orders: number; courtesies: number; tickets_sold: number; tickets_used: number;
  by_method: { method: string; amount: number; orders: number }[];
  by_ticket_type: { name: string; price: number; quantity: number; sold: number }[];
  transfers_pending: number;
};

export type AdminClubDetail = {
  club: { id: string; name: string; slug: string; listing_status: string | null; collection_mode: string; dues_fee_bps: number; debt_blocks_entry: boolean; has_payout_details: boolean };
  members_active: number; members_suspended: number; members_overdue: number; requests_pending: number; overdue_amount: number;
  by_category: { name: string; members: number }[];
  months: { month: string; billed: number; collected: number }[];
  events_total: number; events_upcoming: number;
};

/** Las vistas de admin devuelven "no encontrado" a cualquier cuenta que no sea de administrador de plataforma. */
export async function requireAdmin() {
  if (!(await isPlatformAdmin())) notFound();
  return createClient();
}

export async function getAdminOverview(period: AdminPeriod) {
  const supabase = await requireAdmin();
  const { from, to } = periodRange(period);
  const { data } = await supabase.rpc("admin_overview", { target_from: from, target_to: to });
  return (data ?? null) as AdminOverview | null;
}

export async function getAdminEvents(scope: "upcoming" | "past" | "all", search: string, organizationId: string | null) {
  const supabase = await requireAdmin();
  const { data } = await supabase.rpc("admin_list_events", { target_scope: scope, target_search: search || null, target_org: organizationId, target_limit: 150 });
  return data ?? [];
}

export async function getAdminEventDetail(eventId: string) {
  const supabase = await requireAdmin();
  const { data } = await supabase.rpc("admin_event_detail", { target_event: eventId });
  return (data ?? null) as AdminEventDetail | null;
}

export async function getAdminClubs() {
  const supabase = await requireAdmin();
  const { data } = await supabase.rpc("admin_clubs_overview");
  return data ?? [];
}

export async function getAdminClubDetail(organizationId: string) {
  const supabase = await requireAdmin();
  const { data } = await supabase.rpc("admin_club_detail", { target_org: organizationId });
  return (data ?? null) as AdminClubDetail | null;
}

export async function getAdminProducers() {
  const supabase = await requireAdmin();
  const { data } = await supabase.rpc("admin_list_producers");
  return data ?? [];
}
