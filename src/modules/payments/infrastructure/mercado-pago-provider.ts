import "server-only";

import MercadoPagoConfig, {
  Payment,
  PaymentRefund,
  Preference,
  WebhookSignatureValidator,
} from "mercadopago";
import { z } from "zod";
import { majorToMinor, minorToMajor } from "../domain/money";
import { mapMercadoPagoStatus } from "../domain/status";
import type {
  CreateProviderCheckoutInput,
  OAuthCredentials,
  PaymentProvider,
  ProviderCheckout,
  ProviderCredentials,
  ProviderPayment,
} from "../domain/provider";

const oauthResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).nullable().optional(),
  public_key: z.string().min(1).nullable().optional(),
  user_id: z.union([z.number(), z.string()]),
  expires_in: z.number().int().positive().nullable().optional(),
  scope: z.string().nullable().optional(),
  live_mode: z.boolean().optional().default(false),
});

export class MercadoPagoProvider implements PaymentProvider {
  async createCheckout(input: CreateProviderCheckoutInput, credentials: ProviderCredentials): Promise<ProviderCheckout> {
    const itemTotal = input.items.reduce((total, item) => total + item.unitAmount * item.quantity, 0);
    if (itemTotal + input.serviceFeeAmount !== input.grossAmount) {
      throw new Error("El total interno no coincide con los ítems de la preferencia.");
    }

    const client = new MercadoPagoConfig({ accessToken: credentials.accessToken, options: { timeout: 10_000 } });
    const preference = new Preference(client);
    const returnBase = `${input.appUrl}/payment/return?order=${encodeURIComponent(input.orderPublicId)}`;
    const checkout = await preference.create({
      body: {
        items: [
          ...input.items.map((item) => ({
            id: item.id,
            title: item.name,
            quantity: item.quantity,
            currency_id: input.currency,
            unit_price: minorToMajor(item.unitAmount),
          })),
          ...(input.serviceFeeAmount > 0 ? [{
            id: `service-fee-${input.paymentPublicId}`,
            title: "Cargo de servicio",
            quantity: 1,
            currency_id: input.currency,
            unit_price: minorToMajor(input.serviceFeeAmount),
          }] : []),
        ],
        payer: {
          name: input.payer.firstName,
          surname: input.payer.lastName,
          email: input.payer.email,
          ...(input.payer.document ? { identification: { type: "DNI", number: input.payer.document } } : {}),
        },
        external_reference: input.paymentPublicId,
        metadata: {
          payment_public_id: input.paymentPublicId,
          order_public_id: input.orderPublicId,
        },
        back_urls: {
          success: `${returnBase}&result=success`,
          pending: `${returnBase}&result=pending`,
          failure: `${returnBase}&result=failure`,
        },
        auto_return: "approved",
        notification_url: `${input.appUrl}/api/webhooks/mercadopago`,
        expires: true,
        expiration_date_from: new Date().toISOString(),
        expiration_date_to: input.expiresAt,
        payment_methods: {
          excluded_payment_types: [{ id: "ticket" }],
        },
        statement_descriptor: "ENPASS",
        ...(input.platformFeeAmount > 0 ? { marketplace_fee: minorToMajor(input.platformFeeAmount) } : {}),
      },
      requestOptions: {
        idempotencyKey: input.idempotencyKey,
        timeout: 10_000,
        maxRetries: 2,
      },
    });

    if (!checkout.id || !checkout.init_point) {
      throw new Error("Mercado Pago no devolvió una preferencia utilizable.");
    }

    return {
      providerPreferenceId: checkout.id,
      checkoutUrl: checkout.init_point,
      sandboxCheckoutUrl: checkout.sandbox_init_point ?? null,
    };
  }

  async getPayment(providerPaymentId: string, credentials: ProviderCredentials): Promise<ProviderPayment> {
    const client = new MercadoPagoConfig({ accessToken: credentials.accessToken, options: { timeout: 10_000 } });
    const response = await new Payment(client).get({ id: providerPaymentId });
    if (!response.id || !response.status || !response.external_reference || response.transaction_amount === undefined || !response.currency_id) {
      throw new Error("La respuesta de Mercado Pago no contiene los datos financieros esperados.");
    }

    const grossAmount = majorToMinor(response.transaction_amount);
    const refundedAmount = majorToMinor(response.transaction_amount_refunded ?? 0);
    const processorFeeAmount = (response.fee_details ?? [])
      .filter((fee) => fee.type === "mercadopago_fee")
      .reduce((total, fee) => total + majorToMinor(fee.amount ?? 0), 0);

    return {
      providerPaymentId: String(response.id),
      externalReference: response.external_reference,
      status: mapMercadoPagoStatus(response.status, refundedAmount, grossAmount),
      providerStatus: response.status,
      providerStatusDetail: response.status_detail ?? null,
      grossAmount,
      currency: response.currency_id,
      processorFeeAmount,
      sellerNetAmount: response.transaction_details?.net_received_amount === undefined
        ? null
        : majorToMinor(response.transaction_details.net_received_amount),
      approvedAt: response.date_approved ?? null,
    };
  }

  async refundPayment(providerPaymentId: string, idempotencyKey: string, credentials: ProviderCredentials) {
    const client = new MercadoPagoConfig({ accessToken: credentials.accessToken, options: { timeout: 10_000 } });
    await new PaymentRefund(client).total({
      payment_id: providerPaymentId,
      requestOptions: { idempotencyKey, maxRetries: 2 },
    });
  }

  getAuthorizationUrl(input: { clientId: string; redirectUri: string; state: string; codeChallenge: string }) {
    const url = new URL("https://auth.mercadopago.com/authorization");
    url.searchParams.set("client_id", input.clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("platform_id", "mp");
    url.searchParams.set("state", input.state);
    url.searchParams.set("redirect_uri", input.redirectUri);
    url.searchParams.set("scope", "offline_access");
    url.searchParams.set("code_challenge", input.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    return url.toString();
  }

  async exchangeAuthorizationCode(input: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    code: string;
    codeVerifier: string;
  }) {
    return requestOAuthToken({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: input.codeVerifier,
    });
  }

  async refreshAccountCredentials(input: { clientId: string; clientSecret: string; refreshToken: string }) {
    return requestOAuthToken({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      grant_type: "refresh_token",
      refresh_token: input.refreshToken,
    });
  }

  validateWebhookSignature(input: {
    signature: string | null;
    requestId: string | null;
    dataId: string | null;
    secret: string;
  }) {
    WebhookSignatureValidator.validate({
      xSignature: input.signature,
      xRequestId: input.requestId,
      dataId: input.dataId,
      secret: input.secret,
      toleranceSeconds: 300,
    });
  }
}

async function requestOAuthToken(body: Record<string, string>): Promise<OAuthCredentials> {
  const response = await fetch("https://api.mercadopago.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Mercado Pago rechazó la operación OAuth (${response.status}).`);
  }

  const parsed = oauthResponseSchema.parse(await response.json());
  return {
    accessToken: parsed.access_token,
    refreshToken: parsed.refresh_token ?? null,
    providerAccountId: String(parsed.user_id),
    publicKey: parsed.public_key ?? null,
    expiresInSeconds: parsed.expires_in ?? null,
    scope: parsed.scope ?? null,
    liveMode: parsed.live_mode,
  };
}
