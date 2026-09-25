import "server-only";

import { createAdminClient } from "@/shared/database/admin";
import { deliverTicketsForPaidOrder } from "./deliver-tickets";
import { issueTicketsForPaidOrder } from "./issue-tickets";
import { notifyOrganizerOfSale } from "./notify-organizer-sale";

export async function fulfillPaidOrder(orderId: string, options: { forceDelivery?: boolean } = {}) {
  const issuance = await issueTicketsForPaidOrder(orderId);
  // Door (box-office) buyers may have no email (a synthetic .invalid address): the cashier hands over the ticket
  // on screen, and a busy door must not email the organizer once per sale.
  const { data: orderInfo } = await createAdminClient().from("orders").select("channel, customers(email)").eq("id", orderId).single();
  const buyerEmail = (orderInfo as unknown as { customers: { email: string } | null } | null)?.customers?.email ?? "";
  const isBoxOffice = orderInfo?.channel === "box_office";
  const delivery = buyerEmail.endsWith(".invalid") ? { sent: false, skipped: true } : await deliverTicketsForPaidOrder(orderId, { force: options.forceDelivery });
  const result = issuance.result as { inserted_count?: number } | null;
  if (!isBoxOffice && result && typeof result.inserted_count === "number" && result.inserted_count > 0) {
    try { await notifyOrganizerOfSale(orderId); } catch { /* Never block ticket delivery on a notification failure. */ }
  }
  return { ...issuance, delivery };
}

export async function recoverPaidOrderByPublicId(publicId: string) {
  if (!/^[0-9a-f]{32}$/.test(publicId)) return { status: "not_found" as const };
  const admin = createAdminClient();
  const { data } = await admin.from("orders").select("id, status").eq("public_id", publicId).maybeSingle();
  if (!data) return { status: "not_found" as const };
  if (data.status !== "paid") return { status: data.status };
  try {
    await fulfillPaidOrder(data.id);
    return { status: "issued" as const };
  } catch {
    return { status: "processing" as const };
  }
}
