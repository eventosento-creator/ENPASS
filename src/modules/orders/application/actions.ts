"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/shared/database/admin";
import { getPromoterAttributionSessionHash } from "@/modules/promoters/infrastructure/session";
import { checkoutSchema } from "../domain/checkout";
import type { ActionState } from "@/modules/identity/application/actions";

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
  redirect(`/order/${order.order_public_id}`);
}
