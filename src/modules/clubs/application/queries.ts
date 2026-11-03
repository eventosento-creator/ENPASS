import "server-only";

import { cache } from "react";
import { createClient } from "@/shared/database/server";
import { createAdminClient } from "@/shared/database/admin";
import type { ClubReport } from "../domain/report";
import type { MembershipPlan } from "../domain/plans";
import type { ClubListingSettings, DivisionEnrollmentRow, DivisionRow, MemberRow, MembershipDetail, MembershipDivisionRow, MembershipDue, MembershipRequestRow } from "../domain/club";

export const isClubEnabled = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("club_settings").select("enabled").eq("organization_id", organizationId).maybeSingle();
  return data?.enabled ?? false;
});

export const getClubBranding = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("club_settings").select("brand_logo_url, brand_name, brand_accent_color, cover_image_url, location_text, main_activity, cover_focus_x, cover_focus_y").eq("organization_id", organizationId).maybeSingle();
  return { logoUrl: data?.brand_logo_url ?? null, name: data?.brand_name ?? null, accentColor: data?.brand_accent_color ?? null, coverUrl: data?.cover_image_url ?? null, coverFocus: { x: data?.cover_focus_x ?? 50, y: data?.cover_focus_y ?? 50 }, location: data?.location_text ?? null, activity: data?.main_activity ?? null };
});

export async function searchMembers(organizationId: string, query = ""): Promise<MemberRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_memberships", { target_org: organizationId, target_query: query });
  if (error || !data) return [];
  return data.map((row) => ({
    membershipId: row.membership_id, customerId: row.customer_id, memberNumber: row.member_number,
    firstName: row.first_name, lastName: row.last_name, email: row.email, document: row.document,
    categoryName: row.category_name, membershipStatus: row.membership_status,
    dueStatus: row.due_status, dueAmount: row.due_amount, dueDate: row.due_date,
  }));
}

export async function getMembershipCategories(organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("membership_categories").select("*").eq("organization_id", organizationId).order("sort_order");
  return data ?? [];
}

/** Próximo N° de socio sugerido: el mayor número existente + 1, conservando los ceros a la izquierda
 * (0124 → 0125). Los números no numéricos (ej. "A-12") se ignoran. El club puede cambiarlo a mano. */
export async function getNextMemberNumber(organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("memberships").select("member_number").eq("organization_id", organizationId);
  let max = 0;
  let width = 1;
  for (const { member_number: value } of data ?? []) {
    if (!/^\d{1,15}$/.test(value)) continue;
    if (Number(value) >= max) { max = Number(value); width = value.startsWith("0") ? value.length : 1; }
  }
  return String(max + 1).padStart(width, "0");
}

export const getClubListingSettings = cache(async (organizationId: string): Promise<ClubListingSettings> => {
  const supabase = await createClient();
  const { data } = await supabase.from("club_settings")
    .select("public_description, public_listing_status, public_listing_requested_at, public_listing_reviewed_at, public_listing_rejection_reason")
    .eq("organization_id", organizationId).maybeSingle();
  return {
    status: data?.public_listing_status ?? "none",
    description: data?.public_description ?? null,
    requestedAt: data?.public_listing_requested_at ?? null,
    reviewedAt: data?.public_listing_reviewed_at ?? null,
    rejectionReason: data?.public_listing_rejection_reason ?? null,
  };
});

export async function getMembershipRequests(organizationId: string): Promise<MembershipRequestRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("club_membership_requests")
    .select("id, first_name, last_name, email, phone, document, message, status, created_at, membership_categories(id, name), divisions(id, name)")
    .eq("organization_id", organizationId).order("created_at", { ascending: false });
  return (data ?? []).map((row) => {
    const category = row.membership_categories as unknown as { id: string; name: string } | null;
    const division = (row as unknown as { divisions?: { id: string; name: string } | null }).divisions ?? null;
    return {
      id: row.id, categoryId: category?.id ?? null, categoryName: category?.name ?? null, divisionName: division?.name ?? null,
      firstName: row.first_name, lastName: row.last_name, email: row.email, phone: row.phone,
      document: row.document, message: row.message, status: row.status, createdAt: row.created_at,
    };
  });
}

export async function getMembershipDetail(membershipId: string): Promise<MembershipDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_membership_detail", { target_membership: membershipId });
  const row = data?.[0];
  if (error || !row) return null;
  return {
    membershipId: row.membership_id, organizationId: row.organization_id, customerId: row.customer_id,
    memberNumber: row.member_number, firstName: row.first_name, lastName: row.last_name, email: row.email,
    phone: row.phone, document: row.document, categoryId: row.category_id, categoryName: row.category_name,
    membershipStatus: row.membership_status, statusReason: row.status_reason, statusChangedAt: row.status_changed_at,
    startsAt: row.starts_at, notes: row.notes,
  };
}

export async function getMembershipDues(membershipId: string): Promise<MembershipDue[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_membership_dues", { target_membership: membershipId });
  if (error || !data) return [];
  return data.map((row) => ({
    dueId: row.due_id, period: row.period, amount: row.amount, dueDate: row.due_date, paidAt: row.paid_at,
    paidAmount: row.paid_amount, paymentMethod: row.payment_method, paymentReference: row.payment_reference,
    status: row.status,
  }));
}

export async function listDivisions(organizationId: string): Promise<DivisionRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_divisions", { target_org: organizationId });
  if (error || !data) return [];
  return data.map((row) => ({
    divisionId: row.division_id, name: row.name, monthlyFeeAmount: row.monthly_fee_amount,
    active: row.active, enrolledCount: row.enrolled_count, categoryId: row.category_id,
  }));
}

export async function getDivisionDetail(divisionId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_division_detail", { target_division: divisionId });
  const row = data?.[0];
  if (error || !row) return null;
  return { divisionId: row.division_id, organizationId: row.organization_id, name: row.name, monthlyFeeAmount: row.monthly_fee_amount, active: row.active };
}

export async function getDivisionEnrollments(divisionId: string): Promise<DivisionEnrollmentRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_division_enrollments", { target_division: divisionId });
  if (error || !data) return [];
  return data.map((row) => ({
    enrollmentId: row.enrollment_id, membershipId: row.membership_id, memberNumber: row.member_number,
    firstName: row.first_name, lastName: row.last_name, email: row.email,
    dueStatus: row.due_status, dueAmount: row.due_amount, dueDate: row.due_date,
  }));
}

export async function getMembershipDivisions(membershipId: string): Promise<MembershipDivisionRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_membership_divisions", { target_membership: membershipId });
  if (error || !data) return [];
  return data.map((row) => ({
    enrollmentId: row.enrollment_id, divisionId: row.division_id, divisionName: row.division_name,
    monthlyFeeAmount: row.monthly_fee_amount, dueStatus: row.due_status, dueAmount: row.due_amount, dueDate: row.due_date,
  }));
}

export async function getAvailableDivisionsForMembership(membershipId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_available_divisions_for_membership", { target_membership: membershipId });
  if (error || !data) return [];
  return data.map((row) => ({ divisionId: row.division_id, name: row.name, monthlyFeeAmount: row.monthly_fee_amount }));
}

export async function getDivisionDues(enrollmentId: string): Promise<MembershipDue[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_division_dues", { target_enrollment: enrollmentId });
  if (error || !data) return [];
  return data.map((row) => ({
    dueId: row.due_id, period: row.period, amount: row.amount, dueDate: row.due_date, paidAt: row.paid_at,
    paidAmount: row.paid_amount, paymentMethod: row.payment_method, paymentReference: row.payment_reference,
    status: row.status,
  }));
}

/** Datos del banner del panel del club: identidad + 4 números (socios activos, próximo vencimiento, cuota, actividad). */
export const getClubBannerData = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: settings }, { data: organization }, { count: activeMembers }, { data: nextDue }, { data: categories }, { data: divisionFees }] = await Promise.all([
    supabase.from("club_settings").select("brand_logo_url, brand_name, brand_accent_color, cover_image_url, cover_focus_x, cover_focus_y, location_text, main_activity, public_description").eq("organization_id", organizationId).maybeSingle(),
    supabase.from("organizations").select("name, default_currency").eq("id", organizationId).maybeSingle(),
    supabase.from("memberships").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "active"),
    supabase.from("membership_dues").select("due_date").eq("organization_id", organizationId).is("paid_at", null).gte("due_date", today).order("due_date").limit(1).maybeSingle(),
    supabase.from("membership_categories").select("monthly_fee_amount").eq("organization_id", organizationId).eq("active", true).order("monthly_fee_amount"),
    supabase.from("divisions").select("monthly_fee_amount").eq("organization_id", organizationId).eq("active", true),
  ]);
  // Un colaborador del club no puede leer la fila de la organización (RLS): si es del equipo, se lee el nombre con el cliente de servicio.
  let organizationRow = organization;
  if (!organizationRow && (await supabase.rpc("can_manage_club", { target_org: organizationId })).data) {
    organizationRow = (await createAdminClient().from("organizations").select("name, default_currency").eq("id", organizationId).maybeSingle()).data;
  }
  // El precio puede estar en la categoría o en sus divisiones (cada una con su cuota, no se suman).
  const fees = [...(categories ?? []), ...(divisionFees ?? [])].map((row) => row.monthly_fee_amount).filter((fee) => fee > 0).sort((a, b) => a - b);
  return {
    name: settings?.brand_name || organizationRow?.name || "Tu club",
    logoUrl: settings?.brand_logo_url ?? null,
    accentColor: settings?.brand_accent_color ?? null,
    coverUrl: settings?.cover_image_url ?? null,
    coverFocus: { x: settings?.cover_focus_x ?? 50, y: settings?.cover_focus_y ?? 50 },
    location: settings?.location_text ?? null,
    activity: settings?.main_activity ?? null,
    description: settings?.public_description ?? null,
    currency: organizationRow?.default_currency ?? "ARS",
    activeMembers: activeMembers ?? 0,
    nextDueDate: nextDue?.due_date ?? null,
    feeFrom: fees.length ? fees[0]! : null,
    feeIsSingle: fees.length === 1 || (fees.length > 1 && fees[0] === fees[fees.length - 1]),
  };
});

/** Reporte del club para el período (null si no se pudo calcular o no hay permiso). */
export async function getClubReport(organizationId: string, from: Date, to: Date): Promise<ClubReport | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_club_report", { target_org: organizationId, p_from: from.toISOString(), p_to: to.toISOString() });
  return error || !data ? null : (data as ClubReport);
}

export const getClubPayoutDetails = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("club_settings").select("payout_holder, payout_cuit, payout_alias, payout_cbu").eq("organization_id", organizationId).maybeSingle();
  return { holder: data?.payout_holder ?? "", cuit: data?.payout_cuit ?? "", alias: data?.payout_alias ?? "", cbu: data?.payout_cbu ?? "" };
});

export type ClubSettlements = { mode: "club_account" | "enpass"; pending_amount: number; pending_payments: number; payouts: Array<{ id: string; created_at: string; paid_at: string | null; status: "pending" | "paid" | "failed"; amount: number; payments: number; reference: string | null; method: string | null }> };

export async function getClubSettlements(organizationId: string): Promise<ClubSettlements | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_club_settlements", { target_org: organizationId });
  return error || !data ? null : (data as ClubSettlements);
}

/** Planes de cobro del club con la cantidad de socios que tiene cada uno. */
export async function listMembershipPlans(organizationId: string): Promise<MembershipPlan[]> {
  const supabase = await createClient();
  const [{ data: plans }, { data: assigned }] = await Promise.all([
    supabase.from("membership_plans").select("*").eq("organization_id", organizationId).order("sort_order").order("name"),
    supabase.from("memberships").select("membership_plan_id").eq("organization_id", organizationId).not("membership_plan_id", "is", null),
  ]);
  const counts = new Map<string, number>();
  for (const row of assigned ?? []) if (row.membership_plan_id) counts.set(row.membership_plan_id, (counts.get(row.membership_plan_id) ?? 0) + 1);
  return (plans ?? []).map((plan) => ({ id: plan.id, name: plan.name, kind: plan.kind, mode: plan.pricing_mode, discountBps: plan.discount_bps, fixedAmount: plan.fixed_amount, active: plan.active, memberCount: counts.get(plan.id) ?? 0 }));
}

export async function getMembershipPlanId(membershipId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("memberships").select("membership_plan_id").eq("id", membershipId).maybeSingle();
  return data?.membership_plan_id ?? null;
}
