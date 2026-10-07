import "server-only";

import { createClient } from "@/shared/database/server";
import { createAdminClient } from "@/shared/database/admin";
import { getPaymentAccountAccessToken } from "@/modules/payments/application/account-credentials";
import { assertPublicHttpsUrl, getMercadoPagoRuntimeConfig } from "@/modules/payments/infrastructure/config";
import { computeDuesCharge } from "../domain/dues-fee";
import { getPlatformMercadoPago } from "../infrastructure/platform-collection";
import { MercadoPagoProvider } from "@/modules/payments/infrastructure/mercado-pago-provider";

// Mismo patrón que create-due-checkout.ts, pero para cuotas de división (tabla separada,
// misma cuenta de Mercado Pago del club).
// `verifiedDueAccess`: el llamador ya comprobó que la cuota es del socio de la sesión (pago desde su perfil),
// así que se lee con el cliente de servicio y no se exige permiso de administrador del club.
export async function createDivisionDueCheckout(dueId: string, options: { verifiedDueAccess?: boolean } = {}): Promise<{ checkoutUrl: string }> {
  const supabase = options.verifiedDueAccess ? createAdminClient() : await createClient();
  const { data: due } = await supabase.from("division_dues").select("*").eq("id", dueId).single();
  if (!due) throw new Error("DUE_NOT_FOUND");
  if (due.paid_at) throw new Error("DUE_ALREADY_PAID");

  if (!options.verifiedDueAccess) {
    const { data: canManage } = await (supabase as Awaited<ReturnType<typeof createClient>>).rpc("can_manage_club", { target_org: due.organization_id });
    if (!canManage) throw new Error("NOT_ALLOWED");
  }

  const { data: existing } = await supabase.from("division_due_payments")
    .select("checkout_url").eq("due_id", dueId).eq("status", "pending")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (existing?.checkout_url) return { checkoutUrl: existing.checkout_url };

  const admin = createAdminClient();
  const { data: enrollment } = await admin.from("membership_division_enrollments").select("*").eq("id", due.enrollment_id).single();
  if (!enrollment) throw new Error("ENROLLMENT_NOT_FOUND");
  const [{ data: membership }, { data: division }, { data: account }, { data: org }] = await Promise.all([
    admin.from("memberships").select("*").eq("id", enrollment.membership_id).single(),
    admin.from("divisions").select("name").eq("id", enrollment.division_id).single(),
    admin.from("payment_accounts").select("id").eq("organization_id", due.organization_id).eq("provider", "mercado_pago").eq("status", "connected").maybeSingle(),
    admin.from("organizations").select("name, default_currency, club_dues_fee_bps, club_dues_mp_fee_bps, club_collection_mode").eq("id", due.organization_id).single(),
  ]);
  if (!membership) throw new Error("MEMBERSHIP_NOT_FOUND");
  // Modalidad "ENPASS cobra": el pago entra a la cuenta de ENPASS; si no, a la cuenta de Mercado Pago del club.
  const enpassCollects = org?.club_collection_mode === "enpass";
  if (!enpassCollects && !account) throw new Error("PAYMENT_ACCOUNT_NOT_CONNECTED");
  const { data: customer } = await admin.from("customers").select("*").eq("id", membership.customer_id).single();
  if (!customer) throw new Error("CUSTOMER_NOT_FOUND");

  const config = getMercadoPagoRuntimeConfig();
  assertPublicHttpsUrl(config.appUrl, "APP_URL");
  let accessToken: string;
  if (enpassCollects) {
    const platform = getPlatformMercadoPago();
    if (!platform) throw new Error("PLATFORM_ACCOUNT_NOT_CONFIGURED");
    accessToken = platform.accessToken;
  } else {
    accessToken = await getPaymentAccountAccessToken(account!.id);
  }

  const periodLabel = new Date(`${due.period}T00:00:00`).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
  const currency = org?.default_currency ?? "ARS";
  const divisionName = division?.name ?? "división";

  const charge = computeDuesCharge({ amount: due.amount, feeBps: org?.club_dues_fee_bps ?? 0, mpAbsorbBps: org?.club_dues_mp_fee_bps ?? 0, enpassCollects });
  const serviceFee = charge.serviceFee;

  const checkout = await new MercadoPagoProvider().createCheckout({
    paymentPublicId: due.id,
    orderPublicId: due.id,
    eventName: `Cuota ${divisionName} ${periodLabel}`,
    items: [{ id: due.id, name: `Cuota ${divisionName} · ${org?.name ?? "socio"} · ${periodLabel}`, quantity: 1, unitAmount: due.amount }],
    // Cargo de servicio acordado con el club: lo paga la familia arriba de la cuota y va a ENPASS (marketplace_fee).
    grossAmount: charge.total,
    serviceFeeAmount: serviceFee,
    // Cobrando en la cuenta del club: ENPASS separa su cargo menos la comisión de Mercado Pago que absorbe (así el club recibe ≈ la cuota completa).
    platformFeeAmount: charge.marketplaceFee,
    currency,
    expiresAt: new Date(Date.now() + 48 * 3_600_000).toISOString(),
    idempotencyKey: crypto.randomUUID(),
    appUrl: config.appUrl,
    payer: { firstName: customer.first_name, lastName: customer.last_name, email: customer.email, phone: customer.phone, document: customer.document },
    returnUrl: `${config.appUrl}/socios/cuota-division/${due.id}`,
    notificationUrl: `${config.appUrl}/api/webhooks/mercadopago/divisions`,
  }, { accessToken });

  await admin.from("division_due_payments").insert({
    organization_id: due.organization_id,
    due_id: due.id,
    payment_account_id: enpassCollects ? null : account!.id,
    collected_by: enpassCollects ? "enpass" : "club",
    provider: "mercado_pago",
    provider_preference_id: checkout.providerPreferenceId,
    checkout_url: checkout.checkoutUrl,
    service_fee_amount: serviceFee,
    gross_amount: charge.total,
    absorbed_fee_amount: charge.absorbed,
    status: "pending",
  });

  return { checkoutUrl: checkout.checkoutUrl };
}
