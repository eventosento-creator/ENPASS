import { createClient } from "@/shared/database/server";

export async function getCurrentOrganization() {
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return null;
  const { data: membership } = await supabase.from("organization_members").select("organization_id, role").eq("user_id", user.user.id).limit(1).maybeSingle();
  if (!membership) return null;
  const { data: organization } = await supabase.from("organizations").select("*").eq("id", membership.organization_id).single();
  return organization ? { ...organization, role: membership.role } : null;
}
