import "server-only";

import { createAdminClient } from "@/shared/database/admin";
import { paymentLog } from "@/shared/lib/structured-log";
import { formatMoney } from "@/shared/lib/format";
import { SmtpEmailProvider } from "@/modules/ticketing/infrastructure/smtp-email-provider";

const appUrl = () => {
  const value = process.env.APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  if (!value) throw new Error("APP_URL_NOT_CONFIGURED");
  return value;
};

// Avisa a ENPASS que hay una transferencia para revisar. Nunca rompe la compra: la bandeja del panel igual la muestra.
export async function notifyTransferReviewRequested(orderPublicId: string) {
  try {
    const admin = createAdminClient();
    const { data: order } = await admin.from("orders").select("event_id, customer_id, total_amount, currency").eq("public_id", orderPublicId).maybeSingle();
    if (!order?.customer_id) return;
    const [{ data: event }, { data: customer }] = await Promise.all([
      admin.from("events").select("name").eq("id", order.event_id).maybeSingle(),
      admin.from("customers").select("first_name, last_name, email").eq("id", order.customer_id).maybeSingle(),
    ]);
    await new SmtpEmailProvider().sendTransferReviewRequest({
      to: process.env.PLATFORM_NOTIFY_EMAIL ?? "enpass.gf@gmail.com",
      eventName: event?.name ?? "un evento",
      buyerName: customer ? `${customer.first_name} ${customer.last_name}`.trim() : "Un comprador",
      buyerEmail: customer?.email ?? "",
      amountLabel: formatMoney(order.total_amount, order.currency),
      reviewUrl: new URL("/admin/transferencias", appUrl()).toString(),
    });
  } catch (error) {
    paymentLog("transfer.review_notice.failed", { orderId: orderPublicId, message: error instanceof Error ? error.message : String(error) });
  }
}

// Le avisa al comprador que su transferencia fue rechazada y que puede reintentar.
export async function notifyTransferRejected(orderPublicId: string, reason: string | null) {
  try {
    const admin = createAdminClient();
    const { data: order } = await admin.from("orders").select("event_id, customer_id").eq("public_id", orderPublicId).maybeSingle();
    if (!order?.customer_id) return;
    const [{ data: event }, { data: customer }] = await Promise.all([
      admin.from("events").select("name").eq("id", order.event_id).maybeSingle(),
      admin.from("customers").select("email").eq("id", order.customer_id).maybeSingle(),
    ]);
    if (!customer?.email) return;
    await new SmtpEmailProvider().sendTransferRejected({
      to: customer.email,
      eventName: event?.name ?? "tu evento",
      reason,
      orderUrl: new URL(`/order/${orderPublicId}?metodo=transferencia`, appUrl()).toString(),
    });
  } catch (error) {
    paymentLog("transfer.rejected_notice.failed", { orderId: orderPublicId, message: error instanceof Error ? error.message : String(error) });
  }
}

// Le avisa al productor (dueños y administradores de la cuenta) que ENPASS le pagó una liquidación.
export async function notifyPayoutPaid(payoutId: string) {
  try {
    const admin = createAdminClient();
    const { data: payout } = await admin.from("transfer_payouts").select("organization_id, amount, currency, orders_count, reference").eq("id", payoutId).maybeSingle();
    if (!payout) return;
    const [{ data: organization }, { data: members }] = await Promise.all([
      admin.from("organizations").select("name").eq("id", payout.organization_id).maybeSingle(),
      admin.from("organization_members").select("user_id").eq("organization_id", payout.organization_id).in("role", ["owner", "admin"]),
    ]);
    const emails = (await Promise.all((members ?? []).map(async (member) => (await admin.auth.admin.getUserById(member.user_id)).data.user?.email ?? null))).filter((email): email is string => !!email);
    const provider = new SmtpEmailProvider();
    for (const to of new Set(emails)) {
      await provider.sendPayoutPaid({
        to, organizationName: organization?.name ?? "tu cuenta", amountLabel: formatMoney(payout.amount, payout.currency), ordersCount: payout.orders_count,
        reference: payout.reference, detailUrl: new URL("/app/settings/liquidaciones", appUrl()).toString(),
      });
    }
  } catch (error) {
    paymentLog("transfer.payout_notice.failed", { payoutId, message: error instanceof Error ? error.message : String(error) });
  }
}
