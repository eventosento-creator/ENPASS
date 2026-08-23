"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentOrganization } from "@/modules/organizations/application/queries";
import { createClient } from "@/shared/database/server";
import { paymentLog } from "@/shared/lib/structured-log";
import { createPaymentCheckout } from "./create-payment-checkout";

const publicIdSchema = z.string().regex(/^[0-9a-f]{32}$/);

export async function startPayment(formData: FormData) {
  const parsed = publicIdSchema.safeParse(formData.get("orderPublicId"));
  if (!parsed.success) redirect("/?paymentError=invalid_order");

  let checkoutUrl: string;
  try {
    ({ checkoutUrl } = await createPaymentCheckout(parsed.data));
  } catch (error) {
    redirect(`/order/${parsed.data}?paymentError=${encodeURIComponent(publicErrorCode(error))}`);
  }
  redirect(checkoutUrl as never);
}

export async function disconnectMercadoPago() {
  const organization = await getCurrentOrganization();
  if (!organization) redirect("/login?next=/app/settings");
  const supabase = await createClient();
  const { error } = await supabase.rpc("disconnect_payment_account", {
    target_organization: organization.id,
  });
  if (error) redirect("/app/settings?payment=disconnect-error" as never);
  paymentLog("oauth.disconnected", { organizationId: organization.id });
  revalidatePath("/app/settings");
  redirect("/app/settings?payment=disconnected" as never);
}

function publicErrorCode(error: unknown) {
  const code = error instanceof Error ? error.message : "PAYMENT_UNAVAILABLE";
  const allowed = new Set([
    "HOLD_EXPIRED",
    "PAYMENT_ACCOUNT_REQUIRED",
    "PAYMENT_ACCOUNT_RECONNECT_REQUIRED",
    "ORDER_NOT_PENDING",
  ]);
  return allowed.has(code) ? code.toLowerCase() : "payment_unavailable";
}
