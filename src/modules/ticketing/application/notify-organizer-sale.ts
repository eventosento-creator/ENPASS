import "server-only";

import { createAdminClient } from "@/shared/database/admin";
import { SmtpEmailProvider } from "../infrastructure/smtp-email-provider";
import { ticketingLog } from "@/shared/lib/structured-log";

export async function notifyOrganizerOfSale(orderId: string) {
  const admin = createAdminClient();
  const { data: order } = await admin.from("orders").select("organization_id, event_id, customer_id, total_amount, currency").eq("id", orderId).single();
  if (!order) return;

  const [{ data: event }, { data: customer }, { data: items }, { data: members }] = await Promise.all([
    admin.from("events").select("name").eq("id", order.event_id).single(),
    order.customer_id ? admin.from("customers").select("first_name, last_name").eq("id", order.customer_id).single() : Promise.resolve({ data: null }),
    admin.from("order_items").select("item_name, quantity").eq("order_id", orderId),
    admin.from("organization_members").select("user_id").eq("organization_id", order.organization_id).in("role", ["owner", "admin"]),
  ]);
  if (!event || !members?.length) return;

  const itemsSummary = (items ?? []).map((item) => `${item.quantity}x ${item.item_name}`).join(", ") || "Entrada";
  const buyerName = customer ? `${customer.first_name} ${customer.last_name}`.trim() : "Comprador";
  const dashboardUrl = new URL(`/app/events/${order.event_id}`, appUrl()).toString();
  const provider = new SmtpEmailProvider();

  await Promise.all(members.map(async (member) => {
    const { data: userData } = await admin.auth.admin.getUserById(member.user_id);
    const email = userData?.user?.email;
    if (!email) return;
    try {
      await provider.sendSaleNotification({
        to: email,
        eventName: event.name,
        buyerName,
        itemsSummary,
        totalAmount: order.total_amount,
        currency: order.currency,
        dashboardUrl,
      });
      ticketingLog("sale.notification.sent", { orderId, eventId: order.event_id });
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : String(sendError);
      ticketingLog("sale.notification.failed", { orderId, eventId: order.event_id, message });
    }
  }));
}

function appUrl() {
  const value = process.env.APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  if (!value) throw new Error("APP_URL_NOT_CONFIGURED");
  return value;
}
