import "server-only";

import { createAdminClient } from "@/shared/database/admin";
import { paymentLog } from "@/shared/lib/structured-log";
import type { PaymentAccount } from "@/shared/database/types";
import { getMercadoPagoRuntimeConfig } from "../infrastructure/config";
import { decryptCredential, encryptCredential } from "../infrastructure/credential-cipher";
import { MercadoPagoProvider } from "../infrastructure/mercado-pago-provider";

const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export async function getPaymentAccountAccessToken(accountId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.from("payment_accounts").select("*").eq("id", accountId).single();
  if (error || !data) throw new Error("PAYMENT_ACCOUNT_NOT_FOUND");
  const account = data as PaymentAccount;

  if (account.status !== "connected" || !account.access_token_encrypted) {
    throw new Error("PAYMENT_ACCOUNT_NOT_CONNECTED");
  }

  const expiresAt = account.expires_at ? new Date(account.expires_at).getTime() : null;
  if (expiresAt === null || expiresAt > Date.now() + REFRESH_MARGIN_MS) {
    return decryptCredential(account.access_token_encrypted);
  }

  if (!account.refresh_token_encrypted) {
    await admin.from("payment_accounts").update({ status: "expired" }).eq("id", account.id);
    throw new Error("PAYMENT_ACCOUNT_RECONNECT_REQUIRED");
  }

  try {
    const config = getMercadoPagoRuntimeConfig();
    const refreshed = await new MercadoPagoProvider().refreshAccountCredentials({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      refreshToken: decryptCredential(account.refresh_token_encrypted),
    });

    if (refreshed.liveMode) throw new Error("LIVE_CREDENTIALS_NOT_ALLOWED");

    const nextExpiresAt = refreshed.expiresInSeconds
      ? new Date(Date.now() + refreshed.expiresInSeconds * 1000).toISOString()
      : null;
    const { data: updated, error: updateError } = await admin.from("payment_accounts").update({
      access_token_encrypted: encryptCredential(refreshed.accessToken),
      refresh_token_encrypted: refreshed.refreshToken
        ? encryptCredential(refreshed.refreshToken)
        : account.refresh_token_encrypted,
      provider_public_key: refreshed.publicKey ?? account.provider_public_key,
      token_scope: refreshed.scope ?? account.token_scope,
      provider_account_id: refreshed.providerAccountId,
      expires_at: nextExpiresAt,
      status: "connected",
      last_refreshed_at: new Date().toISOString(),
    }).eq("id", account.id).eq("updated_at", account.updated_at).select("id").maybeSingle();
    if (updateError) throw new Error("CREDENTIAL_REFRESH_PERSIST_FAILED");
    if (!updated) {
      const concurrentToken = await readConcurrentlyRefreshedToken(account);
      if (concurrentToken) return concurrentToken;
      throw new Error("CREDENTIAL_REFRESH_RACE_FAILED");
    }

    return refreshed.accessToken;
  } catch (error) {
    const concurrentToken = await readConcurrentlyRefreshedToken(account);
    if (concurrentToken) return concurrentToken;
    await admin.from("payment_accounts").update({ status: "error" })
      .eq("id", account.id).eq("updated_at", account.updated_at);
    paymentLog("oauth.refresh.failed", {
      organizationId: account.organization_id,
      accountId: account.id,
      errorCode: safeErrorCode(error),
    });
    throw new Error("PAYMENT_ACCOUNT_RECONNECT_REQUIRED");
  }
}

async function readConcurrentlyRefreshedToken(previous: PaymentAccount) {
  const admin = createAdminClient();
  const { data } = await admin.from("payment_accounts").select("*").eq("id", previous.id).single();
  const current = data as PaymentAccount | null;
  if (!current || current.updated_at === previous.updated_at || current.status !== "connected" || !current.access_token_encrypted) {
    return null;
  }
  return decryptCredential(current.access_token_encrypted);
}

function safeErrorCode(error: unknown) {
  if (!(error instanceof Error)) return "unknown";
  return /^[A-Z0-9_]+$/.test(error.message) ? error.message : "provider_error";
}
