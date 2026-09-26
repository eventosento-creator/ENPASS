import "server-only";

import { createAdminClient } from "@/shared/database/admin";
import { hashOpaqueToken } from "@/modules/ticketing/domain/credentials";
import { createPosSessionCredential, getPosSessionHash } from "../infrastructure/pos-session";
import QRCode from "qrcode";
import { issueTicketsForPaidOrder } from "@/modules/ticketing/application/issue-tickets";
import { deliverTicketsForPaidOrder } from "@/modules/ticketing/application/deliver-tickets";
import { createPaymentCheckout } from "@/modules/payments/application/create-payment-checkout";
import { applyProviderPayment } from "@/modules/payments/application/apply-provider-payment";
import { getPaymentAccountAccessToken } from "@/modules/payments/application/account-credentials";
import { MercadoPagoProvider } from "@/modules/payments/infrastructure/mercado-pago-provider";
import type { PosCatalogItem, PosDeviceSessionView, PosPaymentMethod } from "../domain/pos";
import type { BoxOfficeConfig, BoxOfficePaymentMethod, BoxOfficeQuote, BoxOfficeTicketType } from "../domain/box-office";

export function fingerprintPosRequest(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const userAgent = request.headers.get("user-agent")?.slice(0, 240) ?? "unknown";
  return hashOpaqueToken(`${forwardedFor}|${userAgent}`);
}

export async function activatePos(pin: string, fingerprintHash: string) {
  const credential = createPosSessionCredential();
  const { data, error } = await createAdminClient().rpc("activate_pos_device", {
    target_pin: pin, target_session_hash: credential.hash, target_fingerprint_hash: fingerprintHash,
  });
  if (error || !data?.[0]) throw new Error("POS_ACTIVATION_FAILED");
  const activation = data[0];
  if (activation.activation_status !== "ok" || !activation.expires_at || !activation.device_session_id) {
    return { activation, rawSession: null, session: null };
  }
  const session: PosDeviceSessionView = {
    device_session_id: activation.device_session_id,
    device_id: activation.device_id!, event_id: activation.event_id!, event_name: activation.event_name!,
    sales_location_id: activation.sales_location_id!, sales_location_name: activation.sales_location_name!,
    device_name: activation.device_name!, event_timezone: activation.event_timezone!, expires_at: activation.expires_at,
    pos_enabled: true, event_status: "published", cash_session_id: null, cash_session_status: null,
    operator_label: null, opening_cash_amount: null, opened_at: null,
  };
  return { activation, rawSession: credential.raw, session };
}

export async function getCurrentPosSession(): Promise<PosDeviceSessionView | null> {
  const sessionHash = await getPosSessionHash();
  if (!sessionHash) return null;
  const { data, error } = await createAdminClient().rpc("get_pos_device_session", { target_session_hash: sessionHash });
  if (error || !data?.[0]) return null;
  return data[0] as PosDeviceSessionView;
}

export async function getCurrentPosCatalog(): Promise<PosCatalogItem[]> {
  const sessionHash = await getPosSessionHash();
  if (!sessionHash) return [];
  const { data, error } = await createAdminClient().rpc("get_pos_catalog", { target_session_hash: sessionHash });
  if (error) throw new Error("CATALOG_UNAVAILABLE");
  return (data ?? []) as PosCatalogItem[];
}

export async function openCurrentPosSession(openingCashAmount: number, operatorLabel: string) {
  const sessionHash = await getPosSessionHash();
  if (!sessionHash) throw new Error("DEVICE_NOT_AUTHORIZED");
  const { data, error } = await createAdminClient().rpc("open_pos_session", {
    target_session_hash: sessionHash,
    target_opening_cash_amount: openingCashAmount,
    target_operator_label: operatorLabel,
  });
  if (error || !data) throw new Error(error?.message.includes("SESSION_ALREADY_OPEN") ? "SESSION_ALREADY_OPEN" : "OPEN_FAILED");
  return data;
}

export async function finalizeCurrentPosSale(input: {
  idempotencyKey: string;
  items: Array<{ event_product_id: string; quantity: number }>;
  paymentMethod: PosPaymentMethod;
  cashReceivedAmount?: number | null;
  externalReference?: string | null;
}) {
  const sessionHash = await getPosSessionHash();
  if (!sessionHash) throw new Error("DEVICE_NOT_AUTHORIZED");
  const { data, error } = await createAdminClient().rpc("finalize_pos_sale", {
    target_session_hash: sessionHash, target_idempotency_key: input.idempotencyKey,
    target_items: input.items, target_payment_method: input.paymentMethod,
    target_cash_received_amount: input.cashReceivedAmount ?? null,
    target_external_reference: input.externalReference ?? null,
  });
  if (error || !data?.[0]) throw new Error(error?.message ?? "SALE_FAILED");
  return data[0];
}

export async function addCurrentPosCashMovement(type: "cash_in" | "cash_out", amount: number, reason: string) {
  const sessionHash = await getPosSessionHash();
  if (!sessionHash) throw new Error("DEVICE_NOT_AUTHORIZED");
  const { data, error } = await createAdminClient().rpc("add_pos_cash_movement", {
    target_session_hash: sessionHash, target_type: type, target_amount: amount, target_reason: reason,
  });
  if (error || !data) throw new Error("MOVEMENT_FAILED");
  return data;
}

export async function getCurrentPosCashSummary() {
  const sessionHash = await getPosSessionHash();
  if (!sessionHash) return null;
  const { data, error } = await createAdminClient().rpc("get_pos_cash_summary", { target_session_hash: sessionHash });
  if (error || !data?.[0]) return null;
  return data[0];
}

export async function closeCurrentPosSession(countedCashAmount: number) {
  const sessionHash = await getPosSessionHash();
  if (!sessionHash) throw new Error("DEVICE_NOT_AUTHORIZED");
  const { data, error } = await createAdminClient().rpc("close_pos_session", {
    target_session_hash: sessionHash, target_counted_cash_amount: countedCashAmount,
  });
  if (error || !data?.[0]) throw new Error("CLOSE_FAILED");
  return data[0];
}

export async function revokeCurrentPosDeviceSession() {
  const sessionHash = await getPosSessionHash();
  if (!sessionHash) return;
  await createAdminClient().rpc("revoke_current_pos_device_session", { target_session_hash: sessionHash });
}

export async function getCurrentBoxOfficeState(): Promise<{ config: BoxOfficeConfig; catalog: BoxOfficeTicketType[] } | null> {
  const sessionHash = await getPosSessionHash();
  if (!sessionHash) return null;
  const admin = createAdminClient();
  const { data: config } = await admin.rpc("get_box_office_config", { target_session_hash: sessionHash });
  if (!config?.[0]?.enabled) return null;
  const { data: catalog } = await admin.rpc("get_box_office_catalog", { target_session_hash: sessionHash });
  return { config: config[0] as BoxOfficeConfig, catalog: (catalog ?? []) as BoxOfficeTicketType[] };
}

export async function quoteCurrentBoxOfficeSale(ticketTypeId: string, quantity: number): Promise<BoxOfficeQuote> {
  const sessionHash = await getPosSessionHash();
  if (!sessionHash) throw new Error("DEVICE_NOT_AUTHORIZED");
  const { data, error } = await createAdminClient().rpc("quote_box_office_sale", {
    target_session_hash: sessionHash, target_ticket_type: ticketTypeId, target_quantity: quantity,
  });
  if (error || !data?.[0]) throw new Error(error?.message ?? "QUOTE_FAILED");
  return data[0];
}

export async function createCurrentBoxOfficeSale(input: {
  idempotencyKey: string; ticketTypeId: string; quantity: number;
  buyerFirstName: string; buyerLastName: string; buyerDocument: string; buyerEmail: string; buyerPhone: string;
}) {
  const sessionHash = await getPosSessionHash();
  if (!sessionHash) throw new Error("DEVICE_NOT_AUTHORIZED");
  const { data, error } = await createAdminClient().rpc("box_office_create_sale", {
    target_session_hash: sessionHash, target_idempotency_key: input.idempotencyKey,
    target_ticket_type: input.ticketTypeId, target_quantity: input.quantity,
    buyer_first_name: input.buyerFirstName, buyer_last_name: input.buyerLastName,
    buyer_document: input.buyerDocument, buyer_email: input.buyerEmail, buyer_phone: input.buyerPhone,
  });
  if (error || !data?.[0]) throw new Error(error?.message ?? "SALE_FAILED");
  return data[0];
}

// Confirms the cash/terminal collection, then issues the tickets. Organizer sale notifications are
// intentionally skipped: a busy door would flood the producer with one email per sale.
export async function confirmCurrentBoxOfficeSale(input: {
  orderPublicId: string; paymentMethod: BoxOfficePaymentMethod; cashReceivedAmount?: number | null; externalReference?: string | null;
}) {
  const sessionHash = await getPosSessionHash();
  if (!sessionHash) throw new Error("DEVICE_NOT_AUTHORIZED");
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("box_office_confirm_sale", {
    target_session_hash: sessionHash, target_order_public_id: input.orderPublicId,
    target_payment_method: input.paymentMethod, target_cash_received_amount: input.cashReceivedAmount ?? null,
    target_external_reference: input.externalReference ?? null,
  });
  if (error || !data?.[0]) throw new Error(error?.message ?? "CONFIRM_FAILED");
  const sale = data[0];

  let ticketsIssued = true;
  try { await issueTicketsForPaidOrder(sale.order_id); } catch { ticketsIssued = false; }
  const { data: customer } = await admin.from("orders").select("customers(email)").eq("id", sale.order_id).single();
  const email = (customer as unknown as { customers: { email: string } | null } | null)?.customers?.email ?? "";
  const emailed = ticketsIssued && email !== "" && !email.endsWith(".invalid");
  if (emailed) { try { await deliverTicketsForPaidOrder(sale.order_id); } catch { /* The buyer can still open the ticket page. */ } }

  const ticketUrl = new URL(`/order/${sale.order_public_id}`, process.env.APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").toString();
  const ticketQrDataUrl = await QRCode.toDataURL(ticketUrl, { errorCorrectionLevel: "M", margin: 1, width: 320 });
  return { sale, ticketsIssued, emailed, ticketUrl, ticketQrDataUrl };
}

// The buyer pays on the regular online checkout (their own data, Mercado Pago, invoice flow); the cashier only shows
// a QR of that URL with the ticket and quantity already selected. The online checkout charges the ticket's own price,
// so when the box-office (door) price differs from the online price, the QR must point to a link-only ticket that
// has exactly the door price. Otherwise the buyer would be charged the online price.
export async function getBoxOfficeOnlineLink(ticketTypeId: string, quantity: number) {
  const session = await getCurrentPosSession();
  if (!session) throw new Error("DEVICE_NOT_AUTHORIZED");
  const admin = createAdminClient();
  const [{ data: event }, { data: type }, { data: channelPrice, error: channelPriceError }] = await Promise.all([
    admin.from("events").select("slug").eq("id", session.event_id).single(),
    admin.from("ticket_types").select("id, name, price_amount, currency").eq("id", ticketTypeId).eq("event_id", session.event_id).single(),
    admin.from("ticket_type_channel_prices").select("price_amount, enabled").eq("ticket_type_id", ticketTypeId).eq("channel", "box_office").maybeSingle(),
  ]);
  if (!event || !type) throw new Error("EVENT_NOT_FOUND");
  // Never fall back to the online price if the door price could not be read.
  if (channelPriceError) throw new Error("DOOR_PRICE_UNAVAILABLE");
  const doorPrice = channelPrice?.enabled ? channelPrice.price_amount : type.price_amount;

  let item = { id: type.id, name: type.name, unitPrice: type.price_amount, currency: type.currency, token: undefined as string | undefined, maxQuantity: 20 };
  if (doorPrice !== type.price_amount) {
    const { data: candidates, error: candidatesError } = await admin.from("ticket_types").select("id, link_token, price_amount")
      .eq("event_id", session.event_id).eq("link_only", true).eq("active", true).eq("price_amount", doorPrice);
    if (candidatesError) throw new Error("DOOR_PRICE_UNAVAILABLE");
    let chosen: { id: string; link_token: string; name: string; price: number; currency: string; maxQuantity: number } | null = null;
    let notOpenReason: string | null = null;
    for (const candidate of candidates ?? []) {
      if (!candidate.link_token) continue;
      const { data: rows, error: linkError } = await admin.rpc("get_link_ticket_type", { target_event: session.event_id, target_token: candidate.link_token });
      if (linkError) throw new Error("DOOR_PRICE_UNAVAILABLE");
      const row = rows?.[0];
      if (row && !row.sale_open) notOpenReason = `${row.sale_state}|${row.sales_start ?? ""}`;
      if (row?.sale_open) { chosen = { id: row.id, link_token: candidate.link_token, name: row.name, price: row.price_amount, currency: row.currency, maxQuantity: Math.min(row.max_per_order, row.available_quantity) }; break; }
    }
    if (!chosen && notOpenReason) throw new Error(`DOOR_LINK_NOT_OPEN:${doorPrice}|${notOpenReason}`);
    if (!chosen) throw new Error(`NO_DOOR_LINK_TICKET:${doorPrice}`);
    item = { id: chosen.id, name: chosen.name, unitPrice: chosen.price, currency: chosen.currency, token: chosen.link_token, maxQuantity: chosen.maxQuantity };
  }

  const finalQuantity = Math.max(1, Math.min(quantity, item.maxQuantity));
  const selection = JSON.stringify([{ item_type: "ticket", item_id: item.id, quantity: finalQuantity, ...(item.token ? { link_token: item.token } : {}) }]);
  const base = process.env.APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const url = new URL(`/e/${event.slug}/checkout`, base);
  url.searchParams.set("selection", selection);
  const qrDataUrl = await QRCode.toDataURL(url.toString(), { errorCorrectionLevel: "M", margin: 1, width: 360 });
  return { url: url.toString(), qrDataUrl, ticketName: item.name, unitPrice: item.unitPrice, currency: item.currency, quantity: finalQuantity, ticketTypeId: item.id };
}

function ticketUrlFor(orderPublicId: string) {
  return new URL(`/order/${orderPublicId}`, process.env.APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").toString();
}

// The payment QR is only a picture of the Checkout Pro URL of THIS order. It is never a ticket.
export async function startBoxOfficeQr(orderPublicId: string) {
  const sessionHash = await getPosSessionHash();
  if (!sessionHash) throw new Error("DEVICE_NOT_AUTHORIZED");
  const admin = createAdminClient();
  const { data: prepared, error } = await admin.rpc("box_office_prepare_qr", { target_session_hash: sessionHash, target_order_public_id: orderPublicId });
  if (error || !prepared?.[0]) throw new Error(error?.message ?? "QR_PREPARE_FAILED");
  const { checkoutUrl } = await createPaymentCheckout(orderPublicId);
  const qrDataUrl = await QRCode.toDataURL(checkoutUrl, { errorCorrectionLevel: "M", margin: 1, width: 360 });
  return { qrDataUrl, totalAmount: prepared[0].total_amount, currency: prepared[0].currency, expiresAt: prepared[0].expires_at };
}

export async function getBoxOfficeOrderStatus(orderPublicId: string) {
  const sessionHash = await getPosSessionHash();
  if (!sessionHash) throw new Error("DEVICE_NOT_AUTHORIZED");
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("box_office_order_status", { target_session_hash: sessionHash, target_order_public_id: orderPublicId });
  if (error || !data?.[0]) throw new Error(error?.message ?? "STATUS_FAILED");
  const status = data[0];
  if (status.order_status !== "paid") return { status, ticketUrl: null, ticketQrDataUrl: null, ticketsIssued: false };
  let ticketsIssued = true;
  try { await issueTicketsForPaidOrder(status.order_id); } catch { ticketsIssued = false; }
  const ticketUrl = ticketUrlFor(orderPublicId);
  return { status, ticketUrl, ticketQrDataUrl: await QRCode.toDataURL(ticketUrl, { errorCorrectionLevel: "M", margin: 1, width: 320 }), ticketsIssued };
}

// "Ya pagó / Verificar": asks Mercado Pago for the real state and applies it through the same path as the webhook.
// It never marks anything as paid by itself.
export async function verifyBoxOfficePayment(orderPublicId: string) {
  const first = await getBoxOfficeOrderStatus(orderPublicId);
  if (first.status.order_status !== "pending") return first;
  const admin = createAdminClient();
  const { data: payments } = await admin.from("payments").select("public_id, payment_account_id")
    .eq("order_id", first.status.order_id).eq("provider", "mercado_pago").order("attempt_number", { ascending: false });
  const provider = new MercadoPagoProvider();
  for (const payment of payments ?? []) {
    if (!payment.payment_account_id) continue;
    const accessToken = await getPaymentAccountAccessToken(payment.payment_account_id);
    const found = await provider.findPaymentsByExternalReference(payment.public_id, { accessToken });
    const best = found.find((item) => item.status === "approved") ?? found[0];
    if (best) await applyProviderPayment({ accountId: payment.payment_account_id, providerPayment: best });
  }
  return getBoxOfficeOrderStatus(orderPublicId);
}

export async function cancelBoxOfficeSale(orderPublicId: string) {
  const sessionHash = await getPosSessionHash();
  if (!sessionHash) throw new Error("DEVICE_NOT_AUTHORIZED");
  const { error } = await createAdminClient().rpc("box_office_cancel_sale", { target_session_hash: sessionHash, target_order_public_id: orderPublicId });
  if (error) throw new Error(error.message);
}

// Live closure for the "Pagar online (QR)" screen: the buyer pays on the regular online checkout, so there is no
// order tied to this screen. We report the purchases of that ticket created since the QR was shown: reservations
// still being paid, and confirmed payments.
export async function getBoxOfficeOnlineActivity(ticketTypeId: string, since: string) {
  const session = await getCurrentPosSession();
  if (!session) throw new Error("DEVICE_NOT_AUTHORIZED");
  const admin = createAdminClient();
  const { data: type } = await admin.from("ticket_types").select("id").eq("id", ticketTypeId).eq("event_id", session.event_id).maybeSingle();
  if (!type) throw new Error("TICKET_NOT_FOUND");
  const from = new Date(new Date(since).getTime() - 15_000).toISOString();
  const { data: items, error } = await admin.from("order_items").select("order_id, quantity").eq("ticket_type_id", ticketTypeId).gte("created_at", from);
  if (error) throw new Error("ACTIVITY_UNAVAILABLE");
  const quantityByOrder = new Map<string, number>();
  for (const item of items ?? []) quantityByOrder.set(item.order_id, (quantityByOrder.get(item.order_id) ?? 0) + item.quantity);
  if (quantityByOrder.size === 0) return { pending: 0, paid: [] as Array<{ orderPublicId: string; quantity: number; buyerName: string; at: string }> };

  const { data: orders } = await admin.from("orders").select("id, public_id, status, expires_at, customer_id, updated_at")
    .in("id", [...quantityByOrder.keys()]).eq("event_id", session.event_id).eq("channel", "ticket_web");
  const now = Date.now();
  const pending = (orders ?? []).filter((order) => order.status === "pending" && order.expires_at && new Date(order.expires_at).getTime() > now).length;
  const paidOrders = (orders ?? []).filter((order) => order.status === "paid");
  const customerIds = [...new Set(paidOrders.flatMap((order) => (order.customer_id ? [order.customer_id] : [])))];
  const { data: customers } = customerIds.length ? await admin.from("customers").select("id, first_name, last_name").in("id", customerIds) : { data: [] };
  const nameById = new Map((customers ?? []).map((customer) => [customer.id, `${customer.first_name} ${customer.last_name}`.trim()]));
  const paid = paidOrders.map((order) => ({
    orderPublicId: order.public_id, quantity: quantityByOrder.get(order.id) ?? 0,
    buyerName: order.customer_id ? nameById.get(order.customer_id) ?? "Comprador" : "Comprador", at: order.updated_at,
  })).sort((a, b) => b.at.localeCompare(a.at));
  return { pending, paid };
}
