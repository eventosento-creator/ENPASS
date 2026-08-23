import type { ProviderPaymentStatus } from "./status";

export type ProviderCredentials = {
  accessToken: string;
};

export type OAuthCredentials = {
  accessToken: string;
  refreshToken: string | null;
  providerAccountId: string;
  publicKey: string | null;
  expiresInSeconds: number | null;
  scope: string | null;
  liveMode: boolean;
};

export type CheckoutItem = {
  id: string;
  name: string;
  quantity: number;
  unitAmount: number;
};

export type CreateProviderCheckoutInput = {
  paymentPublicId: string;
  orderPublicId: string;
  eventName: string;
  items: CheckoutItem[];
  grossAmount: number;
  serviceFeeAmount: number;
  platformFeeAmount: number;
  currency: string;
  expiresAt: string;
  idempotencyKey: string;
  appUrl: string;
  payer: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    document: string | null;
  };
};

export type ProviderCheckout = {
  providerPreferenceId: string;
  checkoutUrl: string;
  sandboxCheckoutUrl: string | null;
};

export type ProviderPayment = {
  providerPaymentId: string;
  externalReference: string;
  status: ProviderPaymentStatus;
  providerStatus: string;
  providerStatusDetail: string | null;
  grossAmount: number;
  currency: string;
  processorFeeAmount: number;
  sellerNetAmount: number | null;
  approvedAt: string | null;
};

export interface PaymentProvider {
  createCheckout(input: CreateProviderCheckoutInput, credentials: ProviderCredentials): Promise<ProviderCheckout>;
  getPayment(providerPaymentId: string, credentials: ProviderCredentials): Promise<ProviderPayment>;
  refundPayment(providerPaymentId: string, idempotencyKey: string, credentials: ProviderCredentials): Promise<void>;
  getAuthorizationUrl(input: {
    clientId: string;
    redirectUri: string;
    state: string;
    codeChallenge: string;
  }): string;
  exchangeAuthorizationCode(input: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    code: string;
    codeVerifier: string;
  }): Promise<OAuthCredentials>;
  refreshAccountCredentials(input: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
  }): Promise<OAuthCredentials>;
}
