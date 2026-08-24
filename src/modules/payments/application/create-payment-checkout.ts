import "server-only";

import { createAdminClient } from "@/shared/database/admin";
import { paymentLog } from "@/shared/lib/structured-log";
import type { Customer, Event, Order, OrderItem, Payment } from "@/shared/database/types";
import { getPaymentAccountAccessToken } from "./account-credentials";
import { assertPublicHttpsUrl, getMercadoPagoRuntimeConfig } from "../infrastructure/config";
import { MercadoPagoProvider } from "../infrastructure/mercado-pago-provider";

export async function createPaymentCheckout(orderPublicId: string) {
  const config = getMercadoPagoRuntimeConfig();
  assertPublicHttpsUrl(config.appUrl, "APP_URL");
  assertPublicHttpsUrl(config.redirectUri, "MERCADO_PAGO_REDIRECT_URI");

  const admin = createAdminClient();
  const { data: prepared, error: prepareError } = await admin.rpc("prepare_payment_attempt", {
    target_order_public_id: orderPublicId,
  });
  const attempt = prepared?.[0];
  if (prepareError || !attempt) throw new Error(paymentErrorCode(prepareError?.message));

  const { data: paymentData, error: paymentError } = await admin.from("payments").select("*")
    .eq("id", attempt.payment_id).single();
  if (paymentError || !paymentData) throw new Error("PAYMENT_NOT_FOUND");
  const payment = paymentData as Payment;

  const existingCheckout = config.sandbox ? payment.sandbox_checkout_url : payment.checkout_url;
  if (existingCheckout) return { checkoutUrl: existingCheckout, paymentPublicId: payment.public_id };

  const [{ data: orderData }, { data: itemData }, { data: accountData }] = await Promise.all([
    admin.from("orders").select("*").eq("id", payment.order_id).single(),
    admin.from("order_items").select("*").eq("order_id", payment.order_id).order("created_at"),
    admin.from("payment_accounts").select("id").eq("id", payment.payment_account_id).single(),
  ]);
  if (!orderData || !itemData?.length || !accountData) throw new Error("PAYMENT_CONTEXT_INCOMPLETE");
  const order = orderData as Order;
  const items = itemData as OrderItem[];

  const [{ data: customerData }, { data: eventData }] = await Promise.all([
    admin.from("customers").select("*").eq("id", order.customer_id).single(),
    admin.from("events").select("*").eq("id", order.event_id).single(),
  ]);
  if (!customerData || !eventData) throw new Error("PAYMENT_CONTEXT_INCOMPLETE");
  const customer = customerData as Customer;
  const event = eventData as Event;

  try {
    paymentLog("payment.create", { paymentId: payment.id, orderId: order.id, reused: attempt.reused });
    const accessToken = await getPaymentAccountAccessToken(payment.payment_account_id);
    const checkout = await new MercadoPagoProvider().createCheckout({
      paymentPublicId: payment.public_id,
      orderPublicId: order.public_id,
      eventName: event.name,
      items: items.map((item) => ({
        id: item.ticket_type_id ?? item.event_table_id ?? item.id,
        name: `${event.name} · ${item.item_name}`,
        quantity: item.quantity,
        unitAmount: item.unit_price_amount,
      })),
      grossAmount: payment.gross_amount,
      serviceFeeAmount: payment.service_fee_amount,
      platformFeeAmount: payment.platform_fee_amount,
      currency: payment.currency,
      expiresAt: order.expires_at,
      idempotencyKey: payment.idempotency_key,
      appUrl: config.appUrl,
      payer: {
        firstName: customer.first_name,
        lastName: customer.last_name,
        email: customer.email,
        phone: customer.phone,
        document: customer.document,
      },
    }, { accessToken });

    const { error: persistError } = await admin.rpc("set_payment_checkout", {
      target_payment_public_id: payment.public_id,
      target_preference_id: checkout.providerPreferenceId,
      target_checkout_url: checkout.checkoutUrl,
      target_sandbox_checkout_url: checkout.sandboxCheckoutUrl,
    });
    if (persistError) throw new Error("CHECKOUT_PERSIST_FAILED");

    const checkoutUrl = config.sandbox ? checkout.sandboxCheckoutUrl : checkout.checkoutUrl;
    if (!checkoutUrl) throw new Error("SANDBOX_CHECKOUT_URL_MISSING");
    return { checkoutUrl, paymentPublicId: payment.public_id };
  } catch (error) {
    const errorCode = safeErrorCode(error);
    await admin.rpc("fail_payment_checkout", {
      target_payment_public_id: payment.public_id,
      target_error_code: errorCode,
    });
    paymentLog("payment.create.failed", { paymentId: payment.id, orderId: order.id, errorCode });
    throw new Error(errorCode);
  }
}

function paymentErrorCode(message?: string) {
  if (message?.includes("HOLD_EXPIRED")) return "HOLD_EXPIRED";
  if (message?.includes("PAYMENT_ACCOUNT_REQUIRED")) return "PAYMENT_ACCOUNT_REQUIRED";
  if (message?.includes("ORDER_NOT_PENDING")) return "ORDER_NOT_PENDING";
  return "PAYMENT_PREPARE_FAILED";
}

function safeErrorCode(error: unknown) {
  if (!(error instanceof Error)) return "unknown";
  return /^[A-Z0-9_]+$/.test(error.message) ? error.message : "provider_error";
}
