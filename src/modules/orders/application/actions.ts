"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/shared/database/admin";
import { getPromoterAttributionSessionHash } from "@/modules/promoters/infrastructure/session";
import { checkoutSchema } from "../domain/checkout";
import type { ActionState } from "@/modules/identity/application/actions";
import { reconcilePromoterCommissionsForOrder } from "@/modules/promoters/application/commissions";
import { fulfillPaidOrder } from "@/modules/ticketing/application/fulfillment";

export async function createCheckout(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = checkoutSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisá tus datos y seleccioná al menos una opción." };
  const attributionSessionHash = await getPromoterAttributionSessionHash();
  const { data, error } = await createAdminClient().rpc("create_guest_checkout_attributed", {
    target_event: parsed.data.eventId, buyer_first_name: parsed.data.firstName, buyer_last_name: parsed.data.lastName,
    buyer_email: parsed.data.email, buyer_phone: parsed.data.phone, buyer_document: parsed.data.document,
    selections: parsed.data.selections, target_attribution_session_hash: attributionSessionHash,
  });
  const order = data?.[0];
  if (error || !order) return { error: "No pudimos completar la reserva. Es posible que esa disponibilidad ya haya cambiado." };
  const admin = createAdminClient();
  const { data: storedOrder } = await admin.from("orders").select("id, total_amount").eq("public_id", order.order_public_id).single();
  if (!storedOrder) return { error: "No pudimos recuperar la reserva creada." };
  if (storedOrder.total_amount === 0) {
    const { error: confirmationError } = await admin.rpc("complete_free_order", { target_order_public_id: order.order_public_id });
    if (confirmationError) return { error: "La reserva gratuita venció o la disponibilidad cambió. Volvé a intentarlo." };
    try { await reconcilePromoterCommissionsForOrder(storedOrder.id); } catch { /* Reconciliation is retry-safe. */ }
    try { await fulfillPaidOrder(storedOrder.id); } catch { /* The order page retries ticket issuance safely. */ }
  }
  redirect(`/order/${order.order_public_id}`);
}
