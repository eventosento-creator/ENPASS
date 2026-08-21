"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/shared/database/server";
import { checkoutSchema } from "../domain/checkout";
import type { ActionState } from "@/modules/identity/application/actions";

export async function createCheckout(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = checkoutSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisá tus datos y seleccioná al menos una entrada." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_guest_checkout", {
    target_event: parsed.data.eventId, buyer_first_name: parsed.data.firstName, buyer_last_name: parsed.data.lastName,
    buyer_email: parsed.data.email, buyer_phone: parsed.data.phone, buyer_document: parsed.data.document,
    selections: parsed.data.selections,
  });
  const order = data?.[0];
  if (error || !order) return { error: "No pudimos reservar esas entradas. Es posible que ya no estén disponibles." };
  redirect(`/order/${order.order_public_id}`);
}
