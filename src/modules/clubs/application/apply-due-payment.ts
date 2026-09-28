import "server-only";

import { createAdminClient } from "@/shared/database/admin";
import type { ProviderPayment } from "@/modules/payments/domain/provider";

/** Mirrors applyProviderPayment but for membership dues, which don't have an order/event behind
 * them — see the note in 20260928140000_club_memberships.sql for why this stays separate. */
export async function applyDuePayment(providerPayment: ProviderPayment) {
  const admin = createAdminClient();
  const dueId = providerPayment.externalReference;
  const { data: due } = await admin.from("membership_dues").select("*").eq("id", dueId).maybeSingle();
  if (!due) throw new Error("DUE_NOT_FOUND_FOR_PAYMENT");

  const { data: paymentRow } = await admin.from("membership_due_payments")
    .select("*").eq("due_id", dueId).order("created_at", { ascending: false }).limit(1).maybeSingle();

  const mappedStatus = providerPayment.status === "approved" ? "approved"
    : ["rejected", "cancelled", "charged_back"].includes(providerPayment.status) ? "rejected"
    : "pending";

  if (paymentRow) {
    await admin.from("membership_due_payments").update({
      status: mappedStatus, provider_payment_id: providerPayment.providerPaymentId, updated_at: new Date().toISOString(),
    }).eq("id", paymentRow.id);
  }

  if (mappedStatus === "approved" && !due.paid_at) {
    await admin.from("membership_dues").update({
      paid_at: providerPayment.approvedAt ?? new Date().toISOString(),
      paid_amount: providerPayment.grossAmount,
      payment_method: "mercado_pago",
      payment_reference: providerPayment.providerPaymentId,
    }).eq("id", dueId);
  }

  return { dueId, status: mappedStatus };
}
