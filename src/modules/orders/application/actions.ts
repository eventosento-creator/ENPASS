"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/shared/database/admin";
import { createClient } from "@/shared/database/server";
import { getPromoterAttributionSessionHash } from "@/modules/promoters/infrastructure/session";
import { checkoutSchema, courtesyTicketInputSchema } from "../domain/checkout";
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

export async function issueCourtesyTicket(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = courtesyTicketInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisá el nombre, email y tipo de entrada." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_courtesy_checkout", {
    target_event: parsed.data.eventId, target_ticket_type: parsed.data.ticketTypeId,
    buyer_first_name: parsed.data.firstName, buyer_last_name: parsed.data.lastName,
    buyer_email: parsed.data.email, quantity: parsed.data.quantity,
  });
  const order = data?.[0];
  if (error || !order) return { error: "No pudimos generar la cortesía. Revisá que el tipo de entrada siga activo." };
  const admin = createAdminClient();
  const { error: confirmationError } = await admin.rpc("complete_free_order", { target_order_public_id: order.order_public_id });
  if (confirmationError) return { error: "No pudimos confirmar la cortesía. Volvé a intentarlo." };
  const { data: storedOrder } = await admin.from("orders").select("id").eq("public_id", order.order_public_id).single();
  if (storedOrder) { try { await fulfillPaidOrder(storedOrder.id); } catch { /* Retry-safe; the guest still shows up in the list. */ } }
  revalidatePath(`/app/events/${parsed.data.eventId}/guests`);
  return { success: "Cortesía generada y enviada por email." };
}
