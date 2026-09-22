import { cache } from "react";
import { createClient } from "@/shared/database/server";
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
  if (!membership) return null;
  const organization = membership.organizations as unknown as Organization | null;
  return organization ? { ...organization, role: membership.role } : null;
});

export async function getAllOrganizationsForAdmin() {
  const supabase = await createClient();
  const { data } = await supabase.from("organizations").select("id, name, slug").order("name");
  return data ?? [];
}

export const getCollaboratorEventIds = cache(async () => {
  const user = await getAuthUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("event_collaborators").select("event_id").eq("user_id", user.id);
  return (data ?? []).map((row) => row.event_id);
});
