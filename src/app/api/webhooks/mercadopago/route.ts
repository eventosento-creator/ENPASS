import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPaymentAccountAccessToken } from "@/modules/payments/application/account-credentials";
import { getMercadoPagoRuntimeConfig } from "@/modules/payments/infrastructure/config";
import { MercadoPagoProvider } from "@/modules/payments/infrastructure/mercado-pago-provider";
import { createAdminClient } from "@/shared/database/admin";
import type { PaymentAccount, WebhookEvent } from "@/shared/database/types";
import { applyProviderPayment } from "@/modules/payments/application/apply-provider-payment";
import { paymentLog } from "@/shared/lib/structured-log";

const webhookSchema = z.object({
  id: z.union([z.string(), z.number()]),
  type: z.string().min(1),
  action: z.string().optional().default("unknown"),
  user_id: z.union([z.string(), z.number()]),
  live_mode: z.boolean().optional().default(false),
  data: z.object({ id: z.union([z.string(), z.number()]) }),
}).passthrough();

export async function POST(request: NextRequest) {
  let eventId: string | null = null;
  let webhookRecordId: string | null = null;
  try {
    const payload: unknown = await request.json();
    const webhook = webhookSchema.parse(payload);
    eventId = String(webhook.id);
    const dataId = request.nextUrl.searchParams.get("data.id") ?? String(webhook.data.id);
    const config = getMercadoPagoRuntimeConfig();
    new MercadoPagoProvider().validateWebhookSignature({
      signature: request.headers.get("x-signature"),
      requestId: request.headers.get("x-request-id"),
      dataId,
      secret: config.webhookSecret,
    });
    paymentLog("payment.webhook.received", { providerEventId: eventId, resourceId: dataId, eventType: webhook.type });
    const admin = createAdminClient();
    const { data: inserted } = await admin.from("webhook_events").upsert({
      organization_id: null,
      payment_id: null,
      provider: "mercado_pago",
      provider_event_id: eventId,
      provider_resource_id: dataId,
      event_type: webhook.type,
      payload: payload as never,
      status: "received",
      processing_attempts: 0,
      error: null,
      processed_at: null,
    }, { onConflict: "provider,provider_event_id", ignoreDuplicates: true }).select("*").maybeSingle();

    let event = inserted as WebhookEvent | null;
    if (!event) {
      const { data: existing } = await admin.from("webhook_events").select("*")
        .eq("provider", "mercado_pago").eq("provider_event_id", eventId).single();
      event = existing as WebhookEvent | null;
    }
    if (!event) throw new Error("WEBHOOK_EVENT_PERSIST_FAILED");
    webhookRecordId = event.id;
    if (event.status === "processed" || event.status === "duplicate") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    if (event.status === "processing" && Date.now() - new Date(event.updated_at).getTime() < 120_000) {
      return NextResponse.json({ received: true, processing: true });
    }

    const { data: claimed } = await admin.from("webhook_events").update({
      status: "processing",
      processing_attempts: event.processing_attempts + 1,
      error: null,
    }).eq("id", event.id).eq("updated_at", event.updated_at).select("id").maybeSingle();
    if (!claimed) return NextResponse.json({ received: true, processing: true });

    const providerAccountId = String(webhook.user_id);
    const { data: accountData } = await admin.from("payment_accounts").select("*")
      .eq("provider", "mercado_pago").eq("provider_account_id", providerAccountId).eq("status", "connected").single();
    if (!accountData) throw new Error("PAYMENT_ACCOUNT_NOT_FOUND");
    const account = accountData as PaymentAccount;
    const accessToken = await getPaymentAccountAccessToken(account.id);
    const providerPayment = await new MercadoPagoProvider().getPayment(dataId, { accessToken });

    const { payment, result } = await applyProviderPayment({ accountId: account.id, providerPayment, expectedResourceId: dataId });

    await admin.from("webhook_events").update({
      organization_id: account.organization_id,
      payment_id: payment.id,
      status: "processed",
      processed_at: new Date().toISOString(),
      error: null,
    }).eq("id", event.id);
    paymentLog("payment.webhook.processed", { providerEventId: eventId, paymentId: payment.id, result: result ?? "unknown" });
    if (result === "approved") paymentLog("payment.approved", { paymentId: payment.id });
    if (result === "rejected") paymentLog("payment.rejected", { paymentId: payment.id });
    return NextResponse.json({ received: true });
  } catch (error) {
    const errorCode = safeErrorCode(error);
    if (webhookRecordId) {
      const admin = createAdminClient();
      await admin.from("webhook_events").update({ status: "failed", error: errorCode }).eq("id", webhookRecordId);
    }
    paymentLog("payment.webhook.failed", { providerEventId: eventId, errorCode });
    return NextResponse.json({ received: false }, { status: 500 });
  }
}

function safeErrorCode(error: unknown) {
  if (error instanceof z.ZodError) return "invalid_payload";
  if (!(error instanceof Error)) return "unknown";
  return /^[A-Z0-9_]+$/.test(error.message) ? error.message.toLowerCase() : "invalid_signature_or_provider_error";
}
