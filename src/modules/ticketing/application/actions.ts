"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/shared/database/server";
import { createAdminClient } from "@/shared/database/admin";
import { allowRequest, getClientIp } from "@/shared/lib/rate-limit";
import { deliverTicketsForPaidOrder } from "./deliver-tickets";
import { BUYER_ACCESS_RESPONSE, BUYER_SESSION_COOKIE, getBuyerSessionCustomerIds, requestBuyerAccess, revokeBuyerSession } from "./buyer-access";

export type BuyerAccessActionState = { message: string | null };

export async function requestBuyerAccessAction(
  _previous: BuyerAccessActionState,
  formData: FormData,
): Promise<BuyerAccessActionState> {
  const email = String(formData.get("email") ?? "");
  const next = String(formData.get("next") ?? "");
  try {
    // Tope por IP para que no se use el formulario para llenar de mails a otras personas (la respuesta es la misma, no revela nada).
    if (!(await allowRequest("buyer_access_ip", await getClientIp(), 15, 3600))) return { message: BUYER_ACCESS_RESPONSE };
    return await requestBuyerAccess(email, next);
  } catch {
    return { message: BUYER_ACCESS_RESPONSE };
  }
}

export async function logoutBuyer() {
  const cookieStore = await cookies();
  const rawSession = cookieStore.get(BUYER_SESSION_COOKIE)?.value;
  await revokeBuyerSession(rawSession);
  cookieStore.delete(BUYER_SESSION_COOKIE);
  redirect("/mis-entradas" as never);
}

export async function resendTickets(formData: FormData) {
  const parsed = z.object({
    orderId: z.string().uuid(),
    eventId: z.string().uuid(),
  }).safeParse({ orderId: formData.get("orderId"), eventId: formData.get("eventId") });
  if (!parsed.success) redirect("/app/events?delivery=invalid");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/app");
  const { data: order } = await supabase.from("orders").select("id, event_id, organization_id, status")
    .eq("id", parsed.data.orderId).eq("event_id", parsed.data.eventId).maybeSingle();
  if (!order || order.event_id !== parsed.data.eventId || order.status !== "paid") {
    redirect(`/app/events/${parsed.data.eventId}/tickets?delivery=not-allowed`);
  }

  let result: Awaited<ReturnType<typeof deliverTicketsForPaidOrder>>;
  try {
    result = await deliverTicketsForPaidOrder(order.id, { force: true });
  } catch {
    redirect(`/app/events/${parsed.data.eventId}/tickets?delivery=failed`);
  }
  revalidatePath(`/app/events/${parsed.data.eventId}/tickets`);
  redirect(`/app/events/${parsed.data.eventId}/tickets?delivery=${result.sent ? "sent" : "failed"}`);
}

export type HolderActionState = { error?: string; success?: string };

const holderSchema = z.object({
  ticketId: z.uuid(),
  firstName: z.string().trim().min(1, "Escribí el nombre.").max(80),
  lastName: z.string().trim().min(1, "Escribí el apellido.").max(80),
  document: z.string().trim().max(30).default("").transform((value) => value.replace(/[.\s-]/g, "")),
});

/** El comprador cambia el nombre de una de sus entradas (por ejemplo si un amigo no va y viene otro). */
export async function updateTicketHolderAction(_: HolderActionState, formData: FormData): Promise<HolderActionState> {
  const parsed = holderSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revisá los datos." };
  if (!(await allowRequest("ticket_holder_ip", await getClientIp(), 30, 3600))) return { error: "Hiciste muchos cambios en poco tiempo. Esperá un rato y volvé a probar." };
  const customerIds = await getBuyerSessionCustomerIds((await cookies()).get(BUYER_SESSION_COOKIE)?.value);
  if (customerIds.length === 0) return { error: "Tu sesión venció. Ingresá de nuevo para cambiar el nombre." };
  const { error } = await createAdminClient().rpc("update_ticket_holder", {
    target_ticket: parsed.data.ticketId, target_customer_ids: customerIds,
    target_first_name: parsed.data.firstName, target_last_name: parsed.data.lastName, target_document: parsed.data.document || null,
  });
  if (error) {
    if (error.message.includes("EDIT_WINDOW_CLOSED")) return { error: "Ya no se puede cambiar: faltan menos de 3 horas para el evento." };
    if (error.message.includes("NOT_EDITABLE")) return { error: "Esta entrada ya no se puede cambiar (ya se usó o no está vigente)." };
    if (error.message.includes("DOCUMENT_REQUIRED")) return { error: "Este evento pide el DNI de cada persona." };
    if (error.message.includes("INVALID_DOCUMENT")) return { error: "El DNI no es válido: ingresá solo números." };
    if (error.message.includes("NOT_ALLOWED")) return { error: "No podés cambiar esta entrada." };
    return { error: "No pudimos cambiar el nombre. Probá de nuevo." };
  }
  revalidatePath("/mis-entradas", "layout");
  return { success: "Listo: el nombre de la entrada quedó actualizado." };
}
