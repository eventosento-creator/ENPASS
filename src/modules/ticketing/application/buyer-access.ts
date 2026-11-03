import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/shared/database/admin";
import { ticketingLog } from "@/shared/lib/structured-log";
import { generateAccessCode, generateOpaqueToken, hashAccessCode, hashEmail, hashOpaqueToken, normalizeAccessCode, normalizeEmail } from "../domain/credentials";
import type { EmailProvider } from "../infrastructure/email-provider";
import { SmtpEmailProvider } from "../infrastructure/smtp-email-provider";
import { BUYER_ACCESS_PUBLIC_MESSAGE, buyerAccessPublicResult } from "../domain/buyer-access-policy";

export const BUYER_SESSION_COOKIE = "nl_buyer_session";
export const BUYER_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
export const BUYER_ACCESS_RESPONSE = BUYER_ACCESS_PUBLIC_MESSAGE;
const emailSchema = z.string().trim().email().max(320);

export async function createBuyerMagicLink(email: string, options: { expiresAt?: Date; next?: string } = {}) {
  return (await issueBuyerAccess(email, options))?.accessUrl ?? null;
}

/** Crea el pedido de acceso y devuelve el link; con `withCode` también un código de 6 dígitos para escribir en la pantalla. */
async function issueBuyerAccess(email: string, options: { expiresAt?: Date; next?: string; withCode?: boolean } = {}) {
  const normalizedEmail = normalizeEmail(email);
  const rawToken = generateOpaqueToken();
  // Default: 15 min, para el flujo interactivo de "mandame un acceso" (se clickea al toque).
  // El recordatorio de evento pasa un vencimiento más largo explícito (ver send-event-reminders.ts),
  // porque ese mail se manda hasta 36hs antes y se abre recién en la puerta del evento.
  const expiresAt = options.expiresAt ?? new Date(Date.now() + 15 * 60_000);
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
  const next = safeNextPath(options.next);
  if (next) accessUrl.searchParams.set("next", next);
  let code: string | null = null;
  if (options.withCode) {
    const candidate = generateAccessCode();
    const { data: stored } = await admin.rpc("set_buyer_access_code", { target_token_hash: hashOpaqueToken(rawToken), target_code_hash: hashAccessCode(candidate, hashEmail(normalizedEmail)) });
    if (stored) code = candidate;
  }
  return { accessUrl: accessUrl.toString(), code };
}

// Solo rutas internas ("/algo"): evita que el link del mail redirija a otro sitio.
export function safeNextPath(next: string | null | undefined) {
  if (!next || next.length > 2000 || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return null;
  return next;
}

export async function requestBuyerAccess(emailInput: string, next?: string, provider: EmailProvider = new SmtpEmailProvider()) {
  const parsed = emailSchema.safeParse(emailInput);
  ticketingLog("buyer.access.requested", { validEmail: parsed.success });
  if (!parsed.success) return buyerAccessPublicResult("not_found");

  try {
    const access = await issueBuyerAccess(parsed.data, { next, withCode: true });
    if (access) await provider.sendBuyerAccess({ to: normalizeEmail(parsed.data), accessUrl: access.accessUrl, code: access.code ?? undefined });
    return buyerAccessPublicResult(access ? "sent" : "not_found");
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

/** Canjea el código de 6 dígitos que llegó por mail. Devuelve la sesión (para guardar en la cookie) o null si el código no sirve. */
export async function exchangeBuyerAccessCode(emailInput: string, codeInput: string) {
  const email = emailSchema.safeParse(emailInput);
  const code = normalizeAccessCode(codeInput);
  if (!email.success || !code) return null;
  const emailHash = hashEmail(email.data);
  const rawSession = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + BUYER_SESSION_MAX_AGE_SECONDS * 1000);
  const { data, error } = await createAdminClient().rpc("exchange_buyer_access_code", {
    target_email_hash: emailHash,
    target_code_hash: hashAccessCode(code, emailHash),
    target_session_hash: hashOpaqueToken(rawSession),
    target_session_expires_at: expiresAt.toISOString(),
  });
  if (error || data !== true) return null;
  ticketingLog("buyer.access.granted");
  return { rawSession, expiresAt };
}

export function buyerSessionCookieOptions(expiresAt: Date) {
  return { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", expires: expiresAt, maxAge: BUYER_SESSION_MAX_AGE_SECONDS, priority: "high" as const };
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

/** Email verificado de la cuenta del comprador, o null si no hay sesión válida. */
export async function getBuyerSessionEmail(rawSession: string | undefined) {
  if (!rawSession || !/^[A-Za-z0-9_-]{43}$/.test(rawSession)) return null;
  const { data, error } = await createAdminClient().rpc("get_buyer_session_email", { target_session_hash: hashOpaqueToken(rawSession) });
  return error || !data ? null : data;
}

export async function revokeBuyerSession(rawSession: string | undefined) {
  if (!rawSession || !/^[A-Za-z0-9_-]{43}$/.test(rawSession)) return;
  const admin = createAdminClient();
  await admin.rpc("revoke_buyer_session", { target_session_hash: hashOpaqueToken(rawSession) });
}
