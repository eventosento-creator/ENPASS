import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/shared/database/admin";
import { ticketingLog } from "@/shared/lib/structured-log";
import { generateOpaqueToken, hashEmail, hashOpaqueToken, normalizeEmail } from "../domain/credentials";
import type { EmailProvider } from "../infrastructure/email-provider";
import { SmtpEmailProvider } from "../infrastructure/smtp-email-provider";
import { BUYER_ACCESS_PUBLIC_MESSAGE, buyerAccessPublicResult } from "../domain/buyer-access-policy";

export const BUYER_SESSION_COOKIE = "nl_buyer_session";
export const BUYER_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
export const BUYER_ACCESS_RESPONSE = BUYER_ACCESS_PUBLIC_MESSAGE;
const emailSchema = z.string().trim().email().max(320);

export async function createBuyerMagicLink(email: string) {
  const normalizedEmail = normalizeEmail(email);
  const rawToken = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + 15 * 60_000);
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("create_buyer_access_token", {
    target_email: normalizedEmail,
    target_token_hash: hashOpaqueToken(rawToken),
    target_email_hash: hashEmail(normalizedEmail),
    target_expires_at: expiresAt.toISOString(),
  });
  if (error) throw new Error("BUYER_ACCESS_CREATE_FAILED");
  if (!data) return null;
  const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  if (!appUrl) throw new Error("APP_URL_NOT_CONFIGURED");
  const accessUrl = new URL("/buyer/access", appUrl);
  accessUrl.searchParams.set("token", rawToken);
  return accessUrl.toString();
}

export async function requestBuyerAccess(emailInput: string, provider: EmailProvider = new SmtpEmailProvider()) {
  const parsed = emailSchema.safeParse(emailInput);
  ticketingLog("buyer.access.requested", { validEmail: parsed.success });
  if (!parsed.success) return buyerAccessPublicResult("not_found");

  try {
    const accessUrl = await createBuyerMagicLink(parsed.data);
    if (accessUrl) await provider.sendBuyerAccess({ to: normalizeEmail(parsed.data), accessUrl });
    return buyerAccessPublicResult(accessUrl ? "sent" : "not_found");
  } catch {
    // Enumeration-safe by design: the public result is identical for no match and delivery failure.
    return buyerAccessPublicResult("failed");
  }
}

export async function exchangeBuyerAccessToken(rawToken: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(rawToken)) return null;
  const rawSession = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + BUYER_SESSION_MAX_AGE_SECONDS * 1000);
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("exchange_buyer_access_token", {
    target_token_hash: hashOpaqueToken(rawToken),
    target_session_hash: hashOpaqueToken(rawSession),
    target_session_expires_at: expiresAt.toISOString(),
  });
  if (error || !data) return null;
  ticketingLog("buyer.access.granted");
  return { rawSession, expiresAt };
}

export async function getBuyerSessionCustomerIds(rawSession: string | undefined) {
  if (!rawSession || !/^[A-Za-z0-9_-]{43}$/.test(rawSession)) return [];
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_buyer_session_customers", {
    target_session_hash: hashOpaqueToken(rawSession),
  });
  if (error) return [];
  return (data ?? []).map((row) => row.customer_id);
}

export async function revokeBuyerSession(rawSession: string | undefined) {
  if (!rawSession || !/^[A-Za-z0-9_-]{43}$/.test(rawSession)) return;
  const admin = createAdminClient();
  await admin.rpc("revoke_buyer_session", { target_session_hash: hashOpaqueToken(rawSession) });
}
