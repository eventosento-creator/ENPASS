import "server-only";

import { createAdminClient } from "@/shared/database/admin";
import type { ProviderPayment } from "@/modules/payments/domain/provider";
import { sendDivisionDuePaidEmail } from "./membership-emails";

/** Mirrors apply-due-payment.ts, pero para cuotas de división. */
export async function applyDivisionDuePayment(providerPayment: ProviderPayment) {
  const admin = createAdminClient();
  const dueId = providerPayment.externalReference;
  const { data: due } = await admin.from("division_dues").select("*").eq("id", dueId).maybeSingle();
  if (!due) throw new Error("DUE_NOT_FOUND_FOR_PAYMENT");

  const { data: paymentRow } = await admin.from("division_due_payments")
    .select("*").eq("due_id", dueId).order("created_at", { ascending: false }).limit(1).maybeSingle();

  const mappedStatus = providerPayment.status === "approved" ? "approved"
    : ["rejected", "cancelled", "charged_back"].includes(providerPayment.status) ? "rejected"
    : "pending";

  // El pago aprobado tiene que cubrir lo que se cobró (cuota + cargo de servicio, si el club lo tiene).
  if (mappedStatus === "approved" && providerPayment.grossAmount < (paymentRow?.gross_amount ?? due.amount)) throw new Error("DUE_PAYMENT_AMOUNT_MISMATCH");

  if (paymentRow) {
    await admin.from("division_due_payments").update({
      status: mappedStatus, provider_payment_id: providerPayment.providerPaymentId, updated_at: new Date().toISOString(),
      // Lo que cobró Mercado Pago por este pago: ENPASS se lo reintegra al club (acuerdo de cuotas sin costo para el club).
      ...(mappedStatus === "approved" ? { processor_fee_amount: providerPayment.processorFeeAmount, gross_amount: providerPayment.grossAmount } : {}),
    }).eq("id", paymentRow.id);
  }

  if (mappedStatus === "approved" && !due.paid_at) {
    await admin.from("division_dues").update({
      paid_at: providerPayment.approvedAt ?? new Date().toISOString(),
      paid_amount: due.amount,
      payment_method: "mercado_pago",
      payment_reference: providerPayment.providerPaymentId,
    }).eq("id", dueId);

    const { data: enrollment } = await admin.from("membership_division_enrollments").select("membership_id, division_id, organization_id").eq("id", due.enrollment_id).maybeSingle();
    if (enrollment) {
      const [{ data: membership }, { data: division }, { data: org }, { data: settings }] = await Promise.all([
        admin.from("memberships").select("customer_id").eq("id", enrollment.membership_id).maybeSingle(),
        admin.from("divisions").select("name").eq("id", enrollment.division_id).maybeSingle(),
        admin.from("organizations").select("name").eq("id", enrollment.organization_id).maybeSingle(),
        admin.from("club_settings").select("brand_logo_url, brand_name, brand_accent_color").eq("organization_id", enrollment.organization_id).maybeSingle(),
      ]);
      const { data: customer } = membership ? await admin.from("customers").select("email, first_name").eq("id", membership.customer_id).maybeSingle() : { data: null };
      if (customer?.email) {
        await sendDivisionDuePaidEmail({
          to: customer.email, firstName: customer.first_name, organizationName: org?.name ?? "",
          divisionName: division?.name ?? "", period: due.period, amount: providerPayment.grossAmount, paymentMethod: "mercado_pago",
          brand: { logoUrl: settings?.brand_logo_url, name: settings?.brand_name, accentColor: settings?.brand_accent_color },
        });
      }
    }
  }

  return { dueId, status: mappedStatus };
}
