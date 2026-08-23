"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentOrganization } from "@/modules/organizations/application/queries";
import { createClient } from "@/shared/database/server";
import { deliverTicketsForPaidOrder } from "./deliver-tickets";
import { BUYER_ACCESS_RESPONSE, BUYER_SESSION_COOKIE, requestBuyerAccess, revokeBuyerSession } from "./buyer-access";

export type BuyerAccessActionState = { message: string | null };

export async function requestBuyerAccessAction(
  _previous: BuyerAccessActionState,
  formData: FormData,
): Promise<BuyerAccessActionState> {
  const email = String(formData.get("email") ?? "");
  try {
    return await requestBuyerAccess(email);
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

  const organization = await getCurrentOrganization();
  if (!organization) redirect("/login?next=/app");
  const supabase = await createClient();
  const { data: order } = await supabase.from("orders").select("id, event_id, organization_id, status")
    .eq("id", parsed.data.orderId).eq("organization_id", organization.id).maybeSingle();
  if (!order || order.event_id !== parsed.data.eventId || order.status !== "paid") {
    redirect(`/app/events/${parsed.data.eventId}?delivery=not-allowed`);
  }

  let result: Awaited<ReturnType<typeof deliverTicketsForPaidOrder>>;
  try {
    result = await deliverTicketsForPaidOrder(order.id, { force: true });
  } catch {
    redirect(`/app/events/${parsed.data.eventId}?delivery=failed`);
  }
  revalidatePath(`/app/events/${parsed.data.eventId}`);
  redirect(`/app/events/${parsed.data.eventId}?delivery=${result.sent ? "sent" : "failed"}`);
}
