"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/shared/database/server";
import { createAdminClient } from "@/shared/database/admin";
import { paymentLog } from "@/shared/lib/structured-log";
import { fulfillPaidOrder } from "@/modules/ticketing/application/fulfillment";
import { reconcilePromoterCommissionsForOrder } from "@/modules/promoters/application/commissions";
import { processPendingInvoices } from "@/modules/billing/application/process-invoices";
import { notifyTransferRejected } from "./transfer-notices";

const publicIdSchema = z.string().regex(/^[0-9a-f]{32}$/);
const done = (code: string) => redirect(`/admin/transferencias?r=${code}` as never);

/** ENPASS aprueba o rechaza una transferencia. La base solo deja hacerlo a un admin de plataforma. */
export async function reviewTransfer(formData: FormData) {
  const paymentId = publicIdSchema.safeParse(formData.get("paymentPublicId"));
  const approve = formData.get("approve") === "true";
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300) || null;
  if (!paymentId.success) return done("invalid");
  const supabase = await createClient();
  const { data: result, error } = await supabase.rpc("review_transfer_payment", { target_payment_public_id: paymentId.data, target_approve: approve, target_reason: reason });
  if (error) return done(error.message.includes("PAYMENT_NOT_IN_REVIEW") ? "already" : "error");
  paymentLog("transfer.reviewed", { approve, result });

  const admin = createAdminClient();
  const { data: payment } = await admin.from("payments").select("order_id").eq("public_id", paymentId.data).maybeSingle();
  const { data: order } = payment ? await admin.from("orders").select("id, public_id, status").eq("id", payment.order_id).maybeSingle() : { data: null };
  if (order && approve && order.status === "paid") {
    try { await reconcilePromoterCommissionsForOrder(order.id); } catch { /* Retry-safe. */ }
    try { await fulfillPaidOrder(order.id); } catch { /* La página de la orden reintenta la emisión de forma segura. */ }
    try { await processPendingInvoices({ orderId: order.id }); } catch { /* La facturación se reintenta sola. */ }
  }
  if (order && !approve) await notifyTransferRejected(order.public_id, reason);
  revalidatePath("/admin/transferencias");
  if (approve && result !== "approved") return done("conflict");
  return done(approve ? "approved" : "rejected");
}

export async function savePlatformTransferDetails(formData: FormData) {
  const supabase = await createClient();
  const text = (name: string) => String(formData.get(name) ?? "");
  const { error } = await supabase.rpc("set_platform_transfer_details", {
    target_alias: text("alias"), target_cbu: text("cbu"), target_holder: text("holder"), target_cuit: text("cuit"), target_bank: text("bank"),
  });
  revalidatePath("/admin/transferencias");
  return done(error ? "details_error" : "details_saved");
}

export async function setTicketTransfer(formData: FormData) {
  const organizationId = z.string().uuid().safeParse(formData.get("organizationId"));
  if (!organizationId.success) return;
  const supabase = await createClient();
  await supabase.rpc("set_ticket_transfer_enabled", { target_org: organizationId.data, target_enabled: formData.get("enabled") === "true" });
  revalidatePath("/admin/transferencias");
  revalidatePath("/admin/productores");
}

const payoutDone = (code: string) => redirect(`/admin/liquidaciones?r=${code}` as never);

/** ENPASS arma la liquidación de un productor con lo cobrado por transferencia. */
export async function createTransferPayout(formData: FormData) {
  const organizationId = z.string().uuid().safeParse(formData.get("organizationId"));
  if (!organizationId.success) return payoutDone("invalid");
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_transfer_payout", { target_org: organizationId.data, target_include_upcoming: formData.get("includeUpcoming") === "on" });
  revalidatePath("/admin/liquidaciones");
  if (!error) return payoutDone("created");
  return payoutDone(error.message.includes("PAYOUT_DETAILS_REQUIRED") ? "no_details" : error.message.includes("NOTHING_TO_SETTLE") ? "nothing" : "error");
}

/** ENPASS hizo la transferencia al productor: se registra con el comprobante. */
export async function markTransferPayoutPaid(formData: FormData) {
  const payoutId = z.string().uuid().safeParse(formData.get("payoutId"));
  if (!payoutId.success) return payoutDone("invalid");
  const reference = String(formData.get("reference") ?? "").trim().slice(0, 200) || null;
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_transfer_payout_paid", { target_payout: payoutId.data, target_reference: reference });
  revalidatePath("/admin/liquidaciones");
  return payoutDone(error ? "error" : "paid");
}

export async function cancelTransferPayout(formData: FormData) {
  const payoutId = z.string().uuid().safeParse(formData.get("payoutId"));
  if (!payoutId.success) return payoutDone("invalid");
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_transfer_payout", { target_payout: payoutId.data });
  revalidatePath("/admin/liquidaciones");
  return payoutDone(error ? "error" : "cancelled");
}
