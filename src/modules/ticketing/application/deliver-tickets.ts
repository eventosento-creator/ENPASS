import "server-only";

import { createAdminClient } from "@/shared/database/admin";
import type { Customer, Event, Order, Venue } from "@/shared/database/types";
import { formatEventDate } from "@/shared/lib/format";
import { ticketingLog } from "@/shared/lib/structured-log";
import { hashEmail } from "../domain/credentials";
import type { EmailProvider } from "../infrastructure/email-provider";
import { SmtpEmailProvider } from "../infrastructure/smtp-email-provider";
import { createBuyerMagicLink } from "./buyer-access";

export async function deliverTicketsForPaidOrder(
  orderId: string,
  options: { force?: boolean; provider?: EmailProvider } = {},
) {
  const admin = createAdminClient();
  const { data: orderData } = await admin.from("orders").select("*").eq("id", orderId).single();
  if (!orderData) throw new Error("ORDER_NOT_FOUND");
  const order = orderData as Order;
  if (order.status !== "paid") throw new Error("ORDER_NOT_PAID");

  const { data: customerData } = await admin.from("customers").select("*").eq("id", order.customer_id).single();
  if (!customerData) throw new Error("CUSTOMER_NOT_FOUND");
  const customer = customerData as Customer;

  const { data: claim, error: claimError } = await admin.rpc("claim_ticket_delivery", {
    target_order_id: order.id,
    target_destination_hash: hashEmail(customer.email),
    force_delivery: options.force ?? false,
  });
  const delivery = claim?.[0];
  if (claimError || !delivery) throw new Error("DELIVERY_CLAIM_FAILED");
  if (!delivery.should_send) return { sent: false, skipped: true };

  try {
    const [{ data: eventData }, { count: ticketCount }] = await Promise.all([
      admin.from("events").select("*").eq("id", order.event_id).single(),
      admin.from("tickets").select("id", { count: "exact", head: true }).eq("order_id", order.id),
    ]);
    if (!eventData || !ticketCount) throw new Error("DELIVERY_CONTEXT_INCOMPLETE");
    const event = eventData as Event;
    const { data: venueData } = await admin.from("venues").select("*").eq("id", event.venue_id).single();
    if (!venueData) throw new Error("DELIVERY_CONTEXT_INCOMPLETE");
    const venue = venueData as Venue;
    const accessUrl = await createBuyerMagicLink(customer.email);
    if (!accessUrl) throw new Error("BUYER_ACCESS_CREATE_FAILED");

    await (options.provider ?? new SmtpEmailProvider()).sendTicketDelivery({
      to: customer.email,
      eventName: event.name,
      eventDate: formatEventDate(event.starts_at, venue.timezone),
      venueName: venue.name,
      ticketCount,
      accessUrl,
    });
    await admin.rpc("complete_ticket_delivery", {
      target_delivery_id: delivery.delivery_id,
      succeeded: true,
      error_message: null,
    });
    ticketingLog("ticket.email.sent", { orderId, ticketCount });
    return { sent: true, skipped: false };
  } catch (error) {
    const errorCode = safeDeliveryError(error);
    await admin.rpc("complete_ticket_delivery", {
      target_delivery_id: delivery.delivery_id,
      succeeded: false,
      error_message: errorCode,
    });
    ticketingLog("ticket.email.failed", { orderId, errorCode });
    return { sent: false, skipped: false };
  }
}

function safeDeliveryError(error: unknown) {
  if (error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)) return error.message.toLowerCase();
  return "smtp_delivery_failed";
}
