import "server-only";

import QRCode from "qrcode";
import { createAdminClient } from "@/shared/database/admin";
import type { Event, Order, Ticket, TicketStatus, TicketType, Venue } from "@/shared/database/types";
import { hashOpaqueToken } from "../domain/credentials";
import { decryptTicketToken } from "../infrastructure/ticket-cipher";

export type TicketPresentation = {
  shortCode: string;
  status: TicketStatus;
  holderName: string;
  ticketTypeName: string;
  eventName: string;
  eventSlug: string;
  eventCoverUrl: string | null;
  startsAt: string;
  timezone: string;
  venueName: string;
  venueAddress: string;
  sector: string | null;
  maxEntries: number;
  qrSvg: string | null;
};

export async function getTicketPresentationsForOrder(publicId: string) {
  const admin = createAdminClient();
  const { data: orderData } = await admin.from("orders").select("*").eq("public_id", publicId).maybeSingle();
  if (!orderData) return [];
  const order = orderData as Order;
  if (!["paid", "refunded"].includes(order.status)) return [];
  const { data } = await admin.from("tickets").select("*").eq("order_id", order.id)
    .order("order_item_id").order("unit_index");
  return hydrateTicketPresentations((data ?? []) as Ticket[]);
}

export async function getTicketPresentationsForCustomers(customerIds: string[]) {
  if (customerIds.length === 0) return [];
  const admin = createAdminClient();
  const { data } = await admin.from("tickets").select("*").in("customer_id", customerIds).order("issued_at", { ascending: false });
  return hydrateTicketPresentations((data ?? []) as Ticket[]);
}

async function hydrateTicketPresentations(tickets: Ticket[]) {
  if (tickets.length === 0) return [];
  const admin = createAdminClient();
  const eventIds = unique(tickets.map((ticket) => ticket.event_id));
  const typeIds = unique(tickets.map((ticket) => ticket.ticket_type_id));
  const orderIds = unique(tickets.map((ticket) => ticket.order_id));
  const [{ data: eventsData }, { data: typesData }, { data: ordersData }] = await Promise.all([
    admin.from("events").select("*").in("id", eventIds),
    admin.from("ticket_types").select("*").in("id", typeIds),
    admin.from("orders").select("*").in("id", orderIds),
  ]);
  const events = (eventsData ?? []) as Event[];
  const types = (typesData ?? []) as TicketType[];
  const orders = (ordersData ?? []) as Order[];
  const venueIds = unique(events.map((event) => event.venue_id));
  const { data: venuesData } = await admin.from("venues").select("*").in("id", venueIds);
  const venues = (venuesData ?? []) as Venue[];
  const eventById = new Map(events.map((event) => [event.id, event]));
  const typeById = new Map(types.map((type) => [type.id, type]));
  const venueById = new Map(venues.map((venue) => [venue.id, venue]));
  const orderById = new Map(orders.map((order) => [order.id, order]));

  const presentations = await Promise.all(tickets.map(async (ticket): Promise<TicketPresentation | null> => {
    const event = eventById.get(ticket.event_id);
    const ticketType = typeById.get(ticket.ticket_type_id);
    const order = orderById.get(ticket.order_id);
    const venue = event ? venueById.get(event.venue_id) : undefined;
    if (!event || !ticketType || !venue || !order) return null;

    let qrSvg: string | null = null;
    if (ticket.status === "valid" && order.status === "paid") {
      const payload = decryptTicketToken(ticket.qr_token_encrypted);
      if (hashOpaqueToken(payload) !== ticket.qr_token_hash) throw new Error("TICKET_TOKEN_INTEGRITY_FAILED");
      qrSvg = await QRCode.toString(payload, {
        type: "svg",
        errorCorrectionLevel: "M",
        margin: 2,
        width: 720,
        color: { dark: "#050505", light: "#ffffff" },
      });
    }

    return {
      shortCode: ticket.short_code,
      status: order.status === "refunded" ? "refunded" : ticket.status,
      holderName: `${ticket.holder_first_name} ${ticket.holder_last_name}`.trim(),
      ticketTypeName: ticketType.name,
      eventName: event.name,
      eventSlug: event.slug,
      eventCoverUrl: event.cover_image_url,
      startsAt: event.starts_at,
      timezone: venue.timezone,
      venueName: venue.name,
      venueAddress: `${venue.address}, ${venue.city}`,
      sector: ticket.sector,
      maxEntries: ticket.max_entries,
      qrSvg,
    };
  }));

  return presentations.filter((ticket): ticket is TicketPresentation => ticket !== null);
}

function unique(values: string[]) {
  return [...new Set(values)];
}
