"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
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

export async function reviewClubListing(formData: FormData) {
  const organizationId = formData.get("organizationId");
  const approve = formData.get("approve") === "true";
  const rejectionReason = formData.get("rejectionReason");
  if (typeof organizationId !== "string") return;
  const supabase = await createClient();
  await supabase.rpc("review_club_public_listing", {
    target_org: organizationId, target_approve: approve,
    target_rejection_reason: typeof rejectionReason === "string" ? rejectionReason || null : null,
  });
  revalidatePath("/app/admin/clubs");
}
