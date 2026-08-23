import "server-only";

import { createAdminClient } from "@/shared/database/admin";
import { deliverTicketsForPaidOrder } from "./deliver-tickets";
import { issueTicketsForPaidOrder } from "./issue-tickets";

export async function fulfillPaidOrder(orderId: string, options: { forceDelivery?: boolean } = {}) {
  const issuance = await issueTicketsForPaidOrder(orderId);
  const delivery = await deliverTicketsForPaidOrder(orderId, { force: options.forceDelivery });
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
