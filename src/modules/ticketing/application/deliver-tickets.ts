import "server-only";

import QRCode from "qrcode";
import { createAdminClient } from "@/shared/database/admin";
import type { Customer, Event, Order, Ticket, TicketType, Venue } from "@/shared/database/types";
import { ticketingLog } from "@/shared/lib/structured-log";
import { hashEmail, hashOpaqueToken } from "../domain/credentials";
import { decryptTicketToken } from "../infrastructure/ticket-cipher";
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
  if (!order.customer_id) throw new Error("CUSTOMER_NOT_FOUND");

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
    const [{ data: eventData }, { data: ticketRows }] = await Promise.all([
      admin.from("events").select("*").eq("id", order.event_id).single(),
      admin.from("tickets").select("*").eq("order_id", order.id).order("order_item_id").order("unit_index"),
    ]);
    if (!eventData || !ticketRows?.length) throw new Error("DELIVERY_CONTEXT_INCOMPLETE");
    const event = eventData as Event;
    const tickets = ticketRows as Ticket[];
    const { data: venueData } = await admin.from("venues").select("*").eq("id", event.venue_id).single();
    if (!venueData) throw new Error("DELIVERY_CONTEXT_INCOMPLETE");
    const venue = venueData as Venue;

    const typeIds = [...new Set(tickets.flatMap((ticket) => ticket.ticket_type_id ? [ticket.ticket_type_id] : []))];
    const { data: typeRows } = typeIds.length ? await admin.from("ticket_types").select("id, name").in("id", typeIds) : { data: [] };
    const typeNameById = new Map(((typeRows ?? []) as Pick<TicketType, "id" | "name">[]).map((type) => [type.id, type.name]));

    const ticketItems = await Promise.all(tickets.filter((ticket) => ticket.status === "valid").map(async (ticket) => {
      const payload = decryptTicketToken(ticket.qr_token_encrypted);
      if (hashOpaqueToken(payload) !== ticket.qr_token_hash) throw new Error("TICKET_TOKEN_INTEGRITY_FAILED");
      const qrPng = await QRCode.toBuffer(payload, { errorCorrectionLevel: "M", margin: 1, width: 360, color: { dark: "#050505", light: "#ffffff" } });
      return {
        holderName: `${ticket.holder_first_name} ${ticket.holder_last_name}`.trim(),
        document: ticket.holder_document,
        ticketTypeName: ticket.ticket_type_id ? (typeNameById.get(ticket.ticket_type_id) ?? "Entrada") : "Entrada",
        shortCode: ticket.short_code,
        qrPng,
      };
    }));
    if (!ticketItems.length) throw new Error("DELIVERY_CONTEXT_INCOMPLETE");

    // El link personal es un extra: si no se puede crear (tope de 5 por hora por email, que se agota al reintentar), la entrada igual se manda con el acceso general.
    const accessUrl = (await createBuyerMagicLink(customer.email).catch(() => null)) ?? new URL("/mis-entradas", process.env.APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").toString();
    const { dateLabel, timeLabel } = formatEventDateParts(event.starts_at, venue.timezone);

    await (options.provider ?? new SmtpEmailProvider()).sendTicketDelivery({
      to: customer.email,
      eventName: event.name,
      eventDateLabel: dateLabel,
      eventTimeLabel: timeLabel,
      venueName: venue.name,
      venueAddress: venue.address,
      accessUrl,
      tickets: ticketItems,
    });
    await admin.rpc("complete_ticket_delivery", {
      target_delivery_id: delivery.delivery_id,
      succeeded: true,
      error_message: null,
    });
    ticketingLog("ticket.email.sent", { orderId, ticketCount: ticketItems.length });
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

export function formatEventDateParts(value: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).formatToParts(new Date(value));
  const valueOf = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const weekday = valueOf("weekday");
  return {
    dateLabel: `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${valueOf("day")} de ${valueOf("month")}`,
    timeLabel: `${valueOf("hour")}:${valueOf("minute")} hs`,
  };
}

function safeDeliveryError(error: unknown) {
  if (error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)) return error.message.toLowerCase();
  // Errores de nodemailer: se guarda solo el código técnico (EAUTH, ECONNECTION, 535, 550…), nunca el texto del servidor, para poder diagnosticar sin exponer datos.
  const { code, responseCode } = (error ?? {}) as { code?: unknown; responseCode?: unknown };
  const parts = [typeof code === "string" && /^[A-Z_]{3,20}$/.test(code) ? code : null, typeof responseCode === "number" ? String(responseCode) : null].filter(Boolean);
  return parts.length ? `smtp_${parts.join("_")}`.toLowerCase() : "smtp_delivery_failed";
}
