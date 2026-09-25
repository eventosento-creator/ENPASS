import "server-only";

import { createAdminClient } from "@/shared/database/admin";
import { processPendingInvoices } from "@/modules/billing/application/process-invoices";
import { fulfillPaidOrder } from "@/modules/ticketing/application/fulfillment";
import { reconcilePromoterCommissionsForOrder } from "@/modules/promoters/application/commissions";
import type { ProviderPayment } from "../domain/provider";

// The single place where a provider payment (from a webhook or a manual verification) is applied to
// ENPASS: it validates the reference against the account, updates payment/order, issues tickets and invoices.
export async function applyProviderPayment(input: { accountId: string; providerPayment: ProviderPayment; expectedResourceId?: string }) {
  const admin = createAdminClient();
  const { providerPayment } = input;
  const { data: payment } = await admin.from("payments").select("id, public_id, payment_account_id, order_id")
    .eq("public_id", providerPayment.externalReference).eq("payment_account_id", input.accountId).single();
  if (!payment) throw new Error("PAYMENT_REFERENCE_NOT_FOUND");
  if (input.expectedResourceId && providerPayment.providerPaymentId !== input.expectedResourceId) throw new Error("PAYMENT_RESOURCE_MISMATCH");

  const { data: result, error: processError } = await admin.rpc("process_payment_update", {
    target_payment_public_id: payment.public_id,
    target_provider_payment_id: providerPayment.providerPaymentId,
    target_status: providerPayment.status,
    target_provider_status: providerPayment.providerStatus,
    target_provider_status_detail: providerPayment.providerStatusDetail ?? "",
    target_gross_amount: providerPayment.grossAmount,
    target_currency: providerPayment.currency,
    target_processor_fee_amount: providerPayment.processorFeeAmount,
    target_seller_net_amount: providerPayment.sellerNetAmount,
    target_approved_at: providerPayment.approvedAt,
    target_refunded_amount: providerPayment.refundedAmount,
  });
  if (processError) throw new Error("PAYMENT_UPDATE_FAILED");

  const { data: paidOrder } = await admin.from("orders").select("status").eq("id", payment.order_id).single();
  if (paidOrder?.status === "paid") {
    try {
      await reconcilePromoterCommissionsForOrder(payment.order_id);
    } catch {
      // Commission recovery is retry-safe and must never invalidate a confirmed payment.
    }
    try {
      await fulfillPaidOrder(payment.order_id);
    } catch {
      throw new Error("TICKET_FULFILLMENT_FAILED");
    }
  }

  try {
    await processPendingInvoices({ orderId: payment.order_id });
  } catch {
    // Invoicing is retried by the cron sweep and must never invalidate a confirmed payment.
  }
  return { payment, result: result as string | null };
}
