import "server-only";

import { createAdminClient } from "@/shared/database/admin";
import type { PaymentAccount } from "@/shared/database/types";
import { MercadoPagoProvider } from "../infrastructure/mercado-pago-provider";
import { getPaymentAccountAccessToken } from "./account-credentials";
import { applyProviderPayment } from "./apply-provider-payment";

/** Reprocesa un pago de Mercado Pago por su ID (cuando el webhook falló o MP dejó de reintentar).
 * Consulta el pago directo a MP con los tokens de las cuentas conectadas, resuelve la organización
 * dueña por la referencia de la orden y aplica el pago como lo haría el webhook (idempotente). */
export async function reconcileMercadoPagoPayment(mpPaymentId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("payment_accounts").select("*").eq("provider", "mercado_pago").eq("status", "connected");
  const accounts = (data ?? []) as PaymentAccount[];
  if (!accounts.length) throw new Error("No hay cuentas de Mercado Pago conectadas.");

  const provider = new MercadoPagoProvider();
  for (const account of accounts) {
    let providerPayment;
    try {
      providerPayment = await provider.getPayment(mpPaymentId, { accessToken: await getPaymentAccountAccessToken(account.id) });
    } catch {
      continue; // este token no ve ese pago, probamos con la siguiente cuenta
    }
    const sameMpUser = accounts.filter((candidate) => candidate.provider_account_id === account.provider_account_id);
    const { data: owner } = await admin.from("payments").select("payment_account_id")
      .eq("public_id", providerPayment.externalReference).in("payment_account_id", sameMpUser.map((candidate) => candidate.id)).maybeSingle();
    if (!owner?.payment_account_id) continue;
    const { payment, result } = await applyProviderPayment({ accountId: owner.payment_account_id, providerPayment, expectedResourceId: mpPaymentId });
    await admin.from("webhook_events").update({ status: "processed", processed_at: new Date().toISOString(), error: null, payment_id: payment.id })
      .eq("provider", "mercado_pago").eq("provider_resource_id", mpPaymentId).eq("status", "failed");
    return { status: providerPayment.status, result: result ?? "sin cambios" };
  }
  throw new Error("No encontramos ese pago en ninguna cuenta conectada (¿ID correcto?).");
}
