import { cache } from "react";
import { createClient } from "@/shared/database/server";
import { createAdminClient } from "@/shared/database/admin";
import { getAdminViewOrgId } from "../infrastructure/admin-view";
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

export const getCurrentOrganization = cache(async () => {
  const user = await getAuthUser();
  if (!user) return null;
  const supabase = await createClient();

  const adminViewOrgId = await getAdminViewOrgId();
  if (adminViewOrgId) {
    const { data: organization } = await supabase.from("organizations").select("*").eq("id", adminViewOrgId).maybeSingle();
    if (organization) return { ...organization, role: "owner" as const };
  }

  const { data: membership } = await supabase.from("organization_members").select("role, organizations(*)").eq("user_id", user.id).limit(1).maybeSingle();
  if (!membership) {
    // Colaborador del club (staff): no es miembro de la organización, pero puede gestionar socios y cuotas.
    // club_staff no se puede leer con su sesión (RLS), así que se verifica con el cliente de servicio por su user id.
    const admin = createAdminClient();
    const { data: staff } = await admin.from("club_staff").select("organization_id").eq("user_id", user.id).limit(1).maybeSingle();
    if (!staff) return null;
    const { data: staffOrganization } = await admin.from("organizations").select("*").eq("id", staff.organization_id).maybeSingle();
    return staffOrganization ? { ...(staffOrganization as Organization), role: "staff" as const } : null;
  }
  const organization = membership.organizations as unknown as Organization | null;
  return organization ? { ...organization, role: membership.role } : null;
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
  return (data ?? []).map((row) => ({ organizationId: row.organization_id, name: row.name, slug: row.slug, feeBps: row.fee_bps, collected: row.collected_amount, serviceFee: row.service_fee_amount, processorFee: row.processor_fee_amount }));
}
