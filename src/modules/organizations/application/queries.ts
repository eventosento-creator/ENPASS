import type { ClubRole } from "@/modules/clubs/domain/club-roles";
import { cache } from "react";
import { createClient } from "@/shared/database/server";
import { createAdminClient } from "@/shared/database/admin";
import { getAdminViewOrgId } from "../infrastructure/admin-view";
import { getPreferredWorkspaceId } from "../infrastructure/workspace";
import type { Organization } from "@/shared/database/types";

// auth.getUser() is a real network round-trip to Supabase Auth. Several queries on this
// page need "who is logged in" independently (org lookup, collaborator lookup, admin
// check) — without this, each one re-runs it, and a single /app page load was paying for
// it 3-4 times over. cache() memoizes it per request (same pattern as publicEventContext
// on the public event page).
const getAuthUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
});

export const isPlatformAdmin = cache(async () => {
  const user = await getAuthUser();
  if (!user) return false;
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_platform_admin");
  return data === true;
});

export type Workspace = { organization: Organization; role: "owner" | "admin" | "staff"; clubRole: ClubRole | null; logoUrl: string | null };

/** Todos los espacios a los que la persona tiene acceso: donde es dueña/admin y donde es colaboradora del club. */
export const getWorkspaces = cache(async (): Promise<Workspace[]> => {
  const user = await getAuthUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data: memberships } = await supabase.from("organization_members").select("role, organizations(*)").eq("user_id", user.id).order("created_at");
  const own: Array<Omit<Workspace, "logoUrl">> = (memberships ?? []).flatMap((membership) => {
    const organization = membership.organizations as unknown as Organization | null;
    return organization ? [{ organization, role: membership.role, clubRole: null }] : [];
  });
  // Colaborador del club (staff): no es miembro de la organización, pero puede gestionar socios y cuotas.
  // club_staff no se puede leer con su sesión (RLS), así que se verifica con el cliente de servicio por su user id.
  const admin = createAdminClient();
  const { data: staffRows } = await admin.from("club_staff").select("organization_id, role").eq("user_id", user.id);
  const staffIds = (staffRows ?? []).map((row) => row.organization_id).filter((id) => !own.some((workspace) => workspace.organization.id === id));
  const staffOrganizations = staffIds.length ? ((await admin.from("organizations").select("*").in("id", staffIds)).data ?? []) as Organization[] : [];
  const roleByOrg = new Map((staffRows ?? []).map((row) => [row.organization_id, row.role as ClubRole]));
  const all: Array<Omit<Workspace, "logoUrl">> = [...own, ...staffOrganizations.map((organization) => ({ organization, role: "staff" as const, clubRole: roleByOrg.get(organization.id) ?? "viewer" }))];
  // Logo del club (si lo cargó) para mostrarlo en el selector de espacios.
  const { data: logos } = all.length ? await admin.from("club_settings").select("organization_id, brand_logo_url").in("organization_id", all.map((workspace) => workspace.organization.id)) : { data: [] };
  const logoByOrg = new Map((logos ?? []).map((row) => [row.organization_id, row.brand_logo_url]));
  return all.map((workspace) => ({ ...workspace, logoUrl: logoByOrg.get(workspace.organization.id) ?? null }));
});

export const getCurrentOrganization = cache(async () => {
  const user = await getAuthUser();
  if (!user) return null;
  const supabase = await createClient();

  const adminViewOrgId = await getAdminViewOrgId();
  if (adminViewOrgId) {
    const { data: organization } = await supabase.from("organizations").select("*").eq("id", adminViewOrgId).maybeSingle();
    if (organization) return { ...organization, role: "owner" as const, clubRole: null };
  }

  const workspaces = await getWorkspaces();
  if (!workspaces.length) return null;
  // Si tiene más de un espacio, usa el que eligió (cookie); si no, el primero (su propio espacio).
  const preferred = await getPreferredWorkspaceId();
  const current = workspaces.find((workspace) => workspace.organization.id === preferred) ?? workspaces[0]!;
  return { ...current.organization, role: current.role, clubRole: current.clubRole };
});

export async function getAllOrganizationsForAdmin() {
  const supabase = await createClient();
  const { data } = await supabase.from("organizations").select("id, name, slug").order("name");
  return data ?? [];
}

export async function getPendingClubListings() {
  const supabase = await createClient();
  const { data } = await supabase.from("club_settings")
    .select("organization_id, public_description, public_listing_requested_at, organizations(name, slug)")
    .eq("public_listing_status", "pending").order("public_listing_requested_at");
  return (data ?? []).map((row) => {
    const organization = row.organizations as unknown as { name: string; slug: string } | null;
    return {
      organizationId: row.organization_id, name: organization?.name ?? "", slug: organization?.slug ?? "",
      description: row.public_description, requestedAt: row.public_listing_requested_at,
    };
  });
}

export const getCollaboratorEventIds = cache(async () => {
  const user = await getAuthUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("event_collaborators").select("event_id").eq("user_id", user.id);
  return (data ?? []).map((row) => row.event_id);
});

/** Clubes con su cargo de servicio en cuotas y lo cobrado online (solo cuenta ENPASS). */
export async function getAdminClubs() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_list_clubs");
  return (data ?? []).map((row) => ({ organizationId: row.organization_id, name: row.name, slug: row.slug, feeBps: row.fee_bps, mpAbsorbBps: row.mp_absorb_bps, collected: row.collected_amount, serviceFee: row.service_fee_amount, processorFee: row.processor_fee_amount, absorbed: row.absorbed_fee_amount }));
}

export type ClubSettlementRow = { organizationId: string; name: string; mode: "club_account" | "enpass"; feeBps: number; payments: number; owed: number; serviceFee: number; processorFee: number; hasPayoutDetails: boolean };

/** Por club: modalidad de cobro y lo cobrado por ENPASS que todavía no se liquidó. */
export async function getClubSettlementSummary(): Promise<ClubSettlementRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_club_settlement_summary");
  return (data ?? []).map((row) => ({ organizationId: row.organization_id, name: row.name, mode: row.collection_mode as "club_account" | "enpass", feeBps: row.fee_bps, payments: row.payments_count, owed: row.owed_amount, serviceFee: row.service_fee_amount, processorFee: row.processor_fee_amount, hasPayoutDetails: row.has_payout_details }));
}

export async function getRecentClubPayouts() {
  const supabase = await createClient();
  const { data } = await supabase.from("club_payouts").select("*, organizations(name)").order("created_at", { ascending: false }).limit(40);
  return (data ?? []).map((row) => ({
    id: row.id, club: (row.organizations as unknown as { name: string } | null)?.name ?? "", createdAt: row.created_at, paidAt: row.paid_at, status: row.status,
    amount: row.amount, serviceFee: row.service_fee_amount, processorFee: row.processor_fee_amount, payments: row.payments_count, reference: row.reference, destination: row.destination_snapshot,
  }));
}
