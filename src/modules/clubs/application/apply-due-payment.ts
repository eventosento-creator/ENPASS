import "server-only";

import { createAdminClient } from "@/shared/database/admin";
import type { ProviderPayment } from "@/modules/payments/domain/provider";
import { sendDuePaidEmail } from "./membership-emails";

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

  // El pago aprobado tiene que cubrir lo que se cobró (cuota + cargo de servicio, si el club lo tiene).
  if (mappedStatus === "approved" && providerPayment.grossAmount < (paymentRow?.gross_amount ?? due.amount)) throw new Error("DUE_PAYMENT_AMOUNT_MISMATCH");

  if (paymentRow) {
    await admin.from("membership_due_payments").update({
      status: mappedStatus, provider_payment_id: providerPayment.providerPaymentId, updated_at: new Date().toISOString(),
      // Lo que cobró Mercado Pago por este pago: ENPASS se lo reintegra al club (acuerdo de cuotas sin costo para el club).
      ...(mappedStatus === "approved" ? { processor_fee_amount: providerPayment.processorFeeAmount, gross_amount: providerPayment.grossAmount } : {}),
    }).eq("id", paymentRow.id);
  }

  if (mappedStatus === "approved" && !due.paid_at) {
    await admin.from("membership_dues").update({
      paid_at: providerPayment.approvedAt ?? new Date().toISOString(),
      paid_amount: due.amount,
      payment_method: "mercado_pago",
      payment_reference: providerPayment.providerPaymentId,
    }).eq("id", dueId);

    const { data: membership } = await admin.from("memberships").select("customer_id, organization_id").eq("id", due.membership_id).maybeSingle();
    if (membership) {
      const [{ data: customer }, { data: org }, { data: settings }] = await Promise.all([
        admin.from("customers").select("email, first_name").eq("id", membership.customer_id).maybeSingle(),
        admin.from("organizations").select("name").eq("id", membership.organization_id).maybeSingle(),
        admin.from("club_settings").select("brand_logo_url, brand_name, brand_accent_color").eq("organization_id", membership.organization_id).maybeSingle(),
      ]);
      if (customer?.email) {
        await sendDuePaidEmail({
          to: customer.email, firstName: customer.first_name, organizationName: org?.name ?? "",
          period: due.period, amount: providerPayment.grossAmount, paymentMethod: "mercado_pago",
          brand: { logoUrl: settings?.brand_logo_url, name: settings?.brand_name, accentColor: settings?.brand_accent_color },
        });
      }
    }
  }

  return { dueId, status: mappedStatus };
}
