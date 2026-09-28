import "server-only";

import { createClient } from "@/shared/database/server";
import { createAdminClient } from "@/shared/database/admin";
import { getPaymentAccountAccessToken } from "@/modules/payments/application/account-credentials";
import { assertPublicHttpsUrl, getMercadoPagoRuntimeConfig } from "@/modules/payments/infrastructure/config";
import { MercadoPagoProvider } from "@/modules/payments/infrastructure/mercado-pago-provider";

export async function createDueCheckout(dueId: string): Promise<{ checkoutUrl: string }> {
  const supabase = await createClient();
  const { data: due } = await supabase.from("membership_dues").select("*").eq("id", dueId).single();
  if (!due) throw new Error("DUE_NOT_FOUND");
  if (due.paid_at) throw new Error("DUE_ALREADY_PAID");

  const { data: canManage } = await supabase.rpc("can_manage_club", { target_org: due.organization_id });
  if (!canManage) throw new Error("NOT_ALLOWED");

  const { data: existing } = await supabase.from("membership_due_payments")
    .select("checkout_url").eq("due_id", dueId).eq("status", "pending")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (existing?.checkout_url) return { checkoutUrl: existing.checkout_url };

  const admin = createAdminClient();
  const [{ data: membership }, { data: account }, { data: org }] = await Promise.all([
    admin.from("memberships").select("*").eq("id", due.membership_id).single(),
    admin.from("payment_accounts").select("id").eq("organization_id", due.organization_id).eq("provider", "mercado_pago").eq("status", "connected").maybeSingle(),
    admin.from("organizations").select("name, default_currency").eq("id", due.organization_id).single(),
  ]);
  if (!membership) throw new Error("MEMBERSHIP_NOT_FOUND");
  if (!account) throw new Error("PAYMENT_ACCOUNT_NOT_CONNECTED");
  const { data: customer } = await admin.from("customers").select("*").eq("id", membership.customer_id).single();
  if (!customer) throw new Error("CUSTOMER_NOT_FOUND");

  const config = getMercadoPagoRuntimeConfig();
  assertPublicHttpsUrl(config.appUrl, "APP_URL");
  const accessToken = await getPaymentAccountAccessToken(account.id);

  const periodLabel = new Date(`${due.period}T00:00:00`).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
  const currency = org?.default_currency ?? "ARS";

  const checkout = await new MercadoPagoProvider().createCheckout({
    paymentPublicId: due.id,
    orderPublicId: due.id,
    eventName: `Cuota ${periodLabel}`,
    items: [{ id: due.id, name: `Cuota ${org?.name ?? "socio"} · ${periodLabel}`, quantity: 1, unitAmount: due.amount }],
    grossAmount: due.amount,
    serviceFeeAmount: 0,
    platformFeeAmount: 0,
    currency,
    expiresAt: new Date(Date.now() + 48 * 3_600_000).toISOString(),
    idempotencyKey: crypto.randomUUID(),
    appUrl: config.appUrl,
    payer: { firstName: customer.first_name, lastName: customer.last_name, email: customer.email, phone: customer.phone, document: customer.document },
    returnUrl: `${config.appUrl}/socios/cuota/${due.id}`,
    notificationUrl: `${config.appUrl}/api/webhooks/mercadopago/dues`,
  }, { accessToken });

  await admin.from("membership_due_payments").insert({
    organization_id: due.organization_id,
    due_id: due.id,
    payment_account_id: account.id,
    provider: "mercado_pago",
    provider_preference_id: checkout.providerPreferenceId,
    checkout_url: checkout.checkoutUrl,
    status: "pending",
  });

  return { checkoutUrl: checkout.checkoutUrl };
}
