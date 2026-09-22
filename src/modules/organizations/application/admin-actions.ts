"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/shared/database/server";
import { clearAdminViewOrgId, setAdminViewOrgId } from "../infrastructure/admin-view";

export async function viewOrganizationAsAdmin(formData: FormData) {
  const organizationId = formData.get("organizationId");
  if (typeof organizationId !== "string") return;
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_platform_admin");
  if (data !== true) return;
  await setAdminViewOrgId(organizationId);
  redirect("/app");
}

export async function exitAdminView() {
  await clearAdminViewOrgId();
  redirect("/app/admin/organizations" as never);
}
