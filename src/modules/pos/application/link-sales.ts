import "server-only";

import { createAdminClient } from "@/shared/database/admin";

export type LinkSale = { orderPublicId: string; at: string; buyerName: string; ticketName: string; quantity: number; totalAmount: number; serviceFeeAmount: number; status: "paid" | "refunded" };
export type LinkSalesSummary = { tickets: number; gmv: number; fee: number; total: number; pending: number; sales: LinkSale[] };

// Online purchases of link-only tickets (the "Pagar online (QR)" door flow and the private links). They are normal
// online orders, so they do not appear in the cash-register reports. Callers must already have verified that the
// viewer manages the event.
export async function getLinkSalesSummary(eventId: string): Promise<LinkSalesSummary> {
  const admin = createAdminClient();
  const empty = { tickets: 0, gmv: 0, fee: 0, total: 0, pending: 0, sales: [] };
  const { data: types } = await admin.from("ticket_types").select("id, name").eq("event_id", eventId).eq("link_only", true);
  if (!types?.length) return empty;
  const nameByType = new Map(types.map((type) => [type.id, type.name]));
  const { data: items } = await admin.from("order_items").select("order_id, ticket_type_id, quantity, line_total_amount").in("ticket_type_id", [...nameByType.keys()]);
  if (!items?.length) return empty;
  const orderIds = [...new Set(items.map((item) => item.order_id))];
  const { data: orders } = await admin.from("orders").select("id, public_id, status, expires_at, customer_id, subtotal_amount, service_fee_amount, total_amount, updated_at")
    .in("id", orderIds).eq("event_id", eventId).eq("channel", "ticket_web");
  if (!orders?.length) return empty;
  const now = Date.now();
  const settled = orders.filter((order) => order.status === "paid" || order.status === "refunded");
  const customerIds = [...new Set(settled.flatMap((order) => (order.customer_id ? [order.customer_id] : [])))];
  const { data: customers } = customerIds.length ? await admin.from("customers").select("id, first_name, last_name").in("id", customerIds) : { data: [] };
  const buyerById = new Map((customers ?? []).map((customer) => [customer.id, `${customer.first_name} ${customer.last_name}`.trim()]));
  const itemsByOrder = new Map<string, typeof items>();
  for (const item of items) itemsByOrder.set(item.order_id, [...(itemsByOrder.get(item.order_id) ?? []), item]);

  const sales: LinkSale[] = settled.map((order) => {
    const orderItems = itemsByOrder.get(order.id) ?? [];
    return {
      orderPublicId: order.public_id, at: order.updated_at, status: order.status as "paid" | "refunded",
      buyerName: (order.customer_id && buyerById.get(order.customer_id)) || "Comprador",
      ticketName: [...new Set(orderItems.map((item) => nameByType.get(item.ticket_type_id ?? "") ?? "Entrada"))].join(", "),
      quantity: orderItems.reduce((sum, item) => sum + item.quantity, 0), totalAmount: order.total_amount, serviceFeeAmount: order.service_fee_amount,
    };
  }).sort((a, b) => b.at.localeCompare(a.at));
  const paid = settled.filter((order) => order.status === "paid");
  return {
    tickets: paid.reduce((sum, order) => sum + (itemsByOrder.get(order.id) ?? []).reduce((inner, item) => inner + item.quantity, 0), 0),
    gmv: paid.reduce((sum, order) => sum + order.subtotal_amount, 0),
    fee: paid.reduce((sum, order) => sum + order.service_fee_amount, 0),
    total: paid.reduce((sum, order) => sum + order.total_amount, 0),
    pending: orders.filter((order) => order.status === "pending" && order.expires_at && new Date(order.expires_at).getTime() > now).length,
    sales: sales.slice(0, 30),
  };
}
