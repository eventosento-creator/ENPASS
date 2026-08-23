import "server-only";

import { generateTicketCredential } from "../domain/credentials";
import { encryptTicketToken } from "../infrastructure/ticket-cipher";
import { createAdminClient } from "@/shared/database/admin";
import type { Json, Order, OrderItem, Ticket } from "@/shared/database/types";
import { ticketingLog } from "@/shared/lib/structured-log";

type StoredCredential = {
  order_item_id: string;
  unit_index: number;
  short_code: string;
  qr_token_hash: string;
  qr_token_encrypted: string;
};

export async function issueTicketsForPaidOrder(orderId: string) {
  const admin = createAdminClient();
  const [{ data: orderData, error: orderError }, { data: itemData, error: itemError }] = await Promise.all([
    admin.from("orders").select("*").eq("id", orderId).single(),
    admin.from("order_items").select("*").eq("order_id", orderId).order("id"),
  ]);
  if (orderError || !orderData) throw new Error("ORDER_NOT_FOUND");
  if (itemError || !itemData?.length) throw new Error("ORDER_ITEMS_NOT_FOUND");

  const order = orderData as Order;
  const items = itemData as OrderItem[];
  if (order.status !== "paid") throw new Error("ORDER_NOT_PAID");

  ticketingLog("ticket.issue.started", { orderId, itemCount: items.length });
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const credentials = createStoredCredentials(items);
    const { data, error } = await admin.rpc("issue_tickets_for_paid_order", {
      target_order_id: orderId,
      credentials: credentials as unknown as Json,
    });

    if (!error) {
      const { data: ticketData, error: ticketsError } = await admin
        .from("tickets")
        .select("*")
        .eq("order_id", orderId)
        .order("order_item_id")
        .order("unit_index");
      if (ticketsError || !ticketData) throw new Error("TICKET_READ_FAILED");
      const tickets = ticketData as Ticket[];
      ticketingLog("ticket.issue.completed", { orderId, ticketCount: tickets.length });
      return { tickets, result: data };
    }

    if (error.code !== "23505" || attempt === 3) {
      ticketingLog("ticket.issue.failed", { orderId, errorCode: safeDatabaseError(error.message) });
      throw new Error("TICKET_ISSUANCE_FAILED");
    }
  }

  throw new Error("TICKET_ISSUANCE_FAILED");
}

export function createStoredCredentials(items: Pick<OrderItem, "id" | "quantity">[]) {
  const credentials: StoredCredential[] = [];
  const shortCodes = new Set<string>();

  for (const item of items) {
    for (let unitIndex = 1; unitIndex <= item.quantity; unitIndex += 1) {
      let generated = generateTicketCredential();
      while (shortCodes.has(generated.shortCode)) generated = generateTicketCredential();
      shortCodes.add(generated.shortCode);
      credentials.push({
        order_item_id: item.id,
        unit_index: unitIndex,
        short_code: generated.shortCode,
        qr_token_hash: generated.tokenHash,
        qr_token_encrypted: encryptTicketToken(generated.payload),
      });
    }
  }

  return credentials;
}

function safeDatabaseError(message: string) {
  if (message.includes("ORDER_NOT_PAID")) return "order_not_paid";
  if (message.includes("TICKET_CREDENTIAL")) return "invalid_credentials";
  return "database_error";
}
