"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/shared/database/admin";
import { hashOpaqueToken } from "@/modules/ticketing/domain/credentials";
import { SmtpEmailProvider } from "@/modules/ticketing/infrastructure/smtp-email-provider";
import { createMemberQrPayload } from "../infrastructure/member-qr";
import { clearMemberSessionCookie, createMemberSessionCredential, getMemberSessionHash, setMemberSessionCookie } from "../infrastructure/member-session";
import { getMemberPendingDues, getPortalClub } from "./member-portal";
import { createDueCheckout } from "./create-due-checkout";
import { createDivisionDueCheckout } from "./create-division-due-checkout";

export type MemberPortalState = { error?: string; success?: string };

const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export async function loginMember(_: MemberPortalState, formData: FormData): Promise<MemberPortalState> {
  const slug = slugSchema.safeParse(formData.get("slug"));
  const identifier = String(formData.get("identifier") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!slug.success || !identifier || !password) return { error: "Completá tu DNI o mail y tu contraseña." };
  const club = await getPortalClub(slug.data);
  if (!club) return { error: "No encontramos ese club." };
  const credential = createMemberSessionCredential();
  const { data, error } = await createAdminClient().rpc("member_login", {
    target_org: club.organizationId, target_identifier: identifier, target_password: password,
    target_session_hash: credential.hash, target_session_expires_at: credential.expiresAt.toISOString(),
  });
  if (error) return { error: "No pudimos ingresar. Probá de nuevo." };
  const result = data?.[0];
  if (result?.login_status === "locked") return { error: "Demasiados intentos. Esperá 15 minutos o creá una contraseña nueva por mail." };
  if (result?.login_status !== "ok") return { error: "DNI/mail o contraseña incorrectos. Si nunca creaste tu contraseña, usá \"Crear o recuperar contraseña\"." };
  await setMemberSessionCookie(club.slug, credential.raw, credential.expiresAt);
  redirect(`/mi-club/${club.slug}` as never);
}

const GENERIC_ACCESS_MESSAGE = "Si tu DNI o mail está registrado como socio, te mandamos un mail con el link para crear tu contraseña.";

export async function requestMemberPassword(_: MemberPortalState, formData: FormData): Promise<MemberPortalState> {
  const slug = slugSchema.safeParse(formData.get("slug"));
  const identifier = String(formData.get("identifier") ?? "").trim();
  if (!slug.success || !identifier) return { error: "Ingresá tu DNI o tu mail." };
  const club = await getPortalClub(slug.data);
  if (!club) return { error: "No encontramos ese club." };
  const raw = randomBytes(32).toString("base64url");
  const { data } = await createAdminClient().rpc("member_request_password_token", {
    target_org: club.organizationId, target_identifier: identifier, target_token_hash: hashOpaqueToken(raw),
  });
  const row = data?.[0];
  if (row) {
    const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
    if (appUrl) {
      try {
        await new SmtpEmailProvider().sendMemberPassword({
          to: row.email, memberFirstName: row.first_name, organizationName: row.organization_name,
          setupUrl: new URL(`/mi-club/${club.slug}/clave?token=${raw}`, appUrl).toString(),
          brand: { logoUrl: row.brand_logo_url, name: row.brand_name, accentColor: row.brand_accent_color },
        });
      } catch { /* Respuesta idéntica exista o no el socio: un fallo de mail no se muestra. */ }
    }
  }
  return { success: GENERIC_ACCESS_MESSAGE };
}

export async function setMemberPassword(_: MemberPortalState, formData: FormData): Promise<MemberPortalState> {
  const slug = slugSchema.safeParse(formData.get("slug"));
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!slug.success || !/^[A-Za-z0-9_-]{43}$/.test(token)) return { error: "El link no es válido. Pedí uno nuevo." };
  if (password.length < 8) return { error: "La contraseña tiene que tener al menos 8 caracteres." };
  if (password !== String(formData.get("confirm") ?? "")) return { error: "Las contraseñas no coinciden." };
  const club = await getPortalClub(slug.data);
  if (!club) return { error: "No encontramos ese club." };
  const credential = createMemberSessionCredential();
  const { data, error } = await createAdminClient().rpc("member_set_password", {
    target_token_hash: hashOpaqueToken(token), target_password: password,
    target_session_hash: credential.hash, target_session_expires_at: credential.expiresAt.toISOString(),
  });
  if (error || !data) return { error: "El link venció o ya se usó. Pedí uno nuevo desde el ingreso." };
  await setMemberSessionCookie(club.slug, credential.raw, credential.expiresAt);
  redirect(`/mi-club/${club.slug}` as never);
}

export async function logoutMember(formData: FormData) {
  const slug = slugSchema.safeParse(formData.get("slug"));
  if (!slug.success) return;
  const hash = await getMemberSessionHash(slug.data);
  if (hash) await createAdminClient().rpc("member_logout", { target_session_hash: hash });
  await clearMemberSessionCookie(slug.data);
  redirect(`/mi-club/${slug.data}` as never);
}

/** QR vigente del socio logueado (vence en 90 s; la pantalla lo pide de nuevo antes de que caduque). */
export async function refreshMemberQr(slug: string): Promise<string | null> {
  if (!slugSchema.safeParse(slug).success) return null;
  const hash = await getMemberSessionHash(slug);
  if (!hash) return null;
  const { data } = await createAdminClient().rpc("member_get_profile", { target_session_hash: hash });
  const profile = data?.[0];
  if (!profile || profile.club_slug !== slug) return null;
  return createMemberQrPayload(profile.membership_id);
}

/** El socio paga una cuota pendiente suya con Mercado Pago (la del club o la de una división). */
export async function payMemberDue(_: MemberPortalState, formData: FormData): Promise<MemberPortalState> {
  const slug = slugSchema.safeParse(formData.get("slug"));
  const dueId = z.string().uuid().safeParse(formData.get("dueId"));
  if (!slug.success || !dueId.success) return { error: "No encontramos esa cuota." };
  // Solo se puede pagar una cuota que figure entre las pendientes del socio de ESTA sesión.
  const pending = (await getMemberPendingDues(slug.data)).find((due) => due.dueId === dueId.data);
  if (!pending) return { error: "Esa cuota ya está pagada o no es tuya." };
  let checkoutUrl: string;
  try {
    ({ checkoutUrl } = pending.kind === "division" ? await createDivisionDueCheckout(pending.dueId, { verifiedDueAccess: true }) : await createDueCheckout(pending.dueId, { verifiedDueAccess: true }));
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "PAYMENT_ACCOUNT_NOT_CONNECTED") return { error: "El club todavía no habilitó el pago online. Pagá en el club." };
    if (code === "PLATFORM_ACCOUNT_NOT_CONFIGURED") return { error: "El pago online no está disponible por el momento. Pagá en el club." };
    if (code === "DUE_ALREADY_PAID") return { error: "Esa cuota ya está pagada." };
    return { error: "No pudimos abrir Mercado Pago. Probá de nuevo en unos segundos." };
  }
  redirect(checkoutUrl as never);
}
