import { createClient } from "@/shared/database/server";
import { getAdminViewOrgId } from "../infrastructure/admin-view";

export async function isPlatformAdmin() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_platform_admin");
  return data === true;
}

export async function getCurrentOrganization() {
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return null;

  const adminViewOrgId = await getAdminViewOrgId();
  if (adminViewOrgId) {
    const { data: organization } = await supabase.from("organizations").select("*").eq("id", adminViewOrgId).maybeSingle();
    if (organization) return { ...organization, role: "owner" as const };
  }

  const { data: membership } = await supabase.from("organization_members").select("organization_id, role").eq("user_id", user.user.id).limit(1).maybeSingle();
  if (!membership) return null;
  const { data: organization } = await supabase.from("organizations").select("*").eq("id", membership.organization_id).single();
  return organization ? { ...organization, role: membership.role } : null;
}

export async function getAllOrganizationsForAdmin() {
  const supabase = await createClient();
  const { data } = await supabase.from("organizations").select("id, name, slug").order("name");
  return data ?? [];
}

export async function getCollaboratorEventIds() {
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return [];
  const { data } = await supabase.from("event_collaborators").select("event_id").eq("user_id", user.user.id);
  return (data ?? []).map((row) => row.event_id);
}
