"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/shared/database/server";
import { allowRequest, getClientIp } from "@/shared/lib/rate-limit";
import { deliverTicketsForPaidOrder } from "./deliver-tickets";
import { BUYER_ACCESS_RESPONSE, BUYER_SESSION_COOKIE, requestBuyerAccess, revokeBuyerSession } from "./buyer-access";

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
