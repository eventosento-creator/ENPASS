import "server-only";

import { createClient } from "@/shared/database/server";
import { resolveGroup, resolvePeriod, type OrgReport, type ReportFilters } from "../domain/report";

/** Reporte del productor: una sola llamada a get_org_report (agregación en SQL, con chequeo de organización adentro). */
export async function getOrgReport(organizationId: string, filters: ReportFilters) {
  const range = resolvePeriod(filters);
  const group = resolveGroup(filters.group, range);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_org_report", {
    target_org: organizationId, p_from: range.from.toISOString(), p_to: range.to.toISOString(),
    p_event: filters.event ?? null, p_group: group, p_channel: filters.channel ?? null, p_city: filters.city ?? null, p_status: filters.status ?? null,
  });
  if (error || !data) throw new Error("REPORT_UNAVAILABLE");
  return { report: data as OrgReport, range, group };
}

/** Opciones de los filtros: eventos (para el selector) y ciudades de los lugares de la organización. */
export async function getReportFilterOptions(organizationId: string) {
  const supabase = await createClient();
  const [{ data: events }, { data: venues }] = await Promise.all([
    supabase.from("events").select("id, name, starts_at").eq("organization_id", organizationId).neq("status", "draft").order("starts_at", { ascending: false }).limit(150),
    supabase.from("venues").select("city").eq("organization_id", organizationId),
  ]);
  const cities = [...new Set((venues ?? []).map((venue) => venue.city).filter(Boolean))].toSorted((a, b) => a.localeCompare(b, "es-AR"));
  return { events: events ?? [], cities };
}
