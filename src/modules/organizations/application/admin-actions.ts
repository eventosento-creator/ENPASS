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

export type ReconcileState = { error?: string; success?: string };

export async function reconcilePayment(_: ReconcileState, formData: FormData): Promise<ReconcileState> {
  const mpPaymentId = String(formData.get("mpPaymentId") ?? "").trim();
  if (!/^\d{6,20}$/.test(mpPaymentId)) return { error: "Ingresá el ID numérico de la operación de Mercado Pago." };
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_platform_admin");
  if (data !== true) return { error: "No autorizado." };
  try {
    const { reconcileMercadoPagoPayment } = await import("@/modules/payments/application/reconcile-payment");
    const { status, result } = await reconcileMercadoPagoPayment(mpPaymentId);
    return { success: `Pago ${mpPaymentId} reprocesado (estado MP: ${status}, resultado: ${result}).` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No pudimos reprocesar el pago." };
  }
}

/** Fija el cargo de servicio (en %) que se suma a las cuotas online de un club. 0 = sin cargo. */
export async function setClubDuesFee(formData: FormData) {
  const organizationId = formData.get("organizationId");
  const percent = Number(String(formData.get("percent") ?? "").replace(",", "."));
  if (typeof organizationId !== "string" || !Number.isFinite(percent) || percent < 0 || percent > 50) return;
  const supabase = await createClient();
  await supabase.rpc("set_club_dues_fee", { target_org: organizationId, target_bps: Math.round(percent * 100) });
  revalidatePath("/app/admin/clubs");
}
