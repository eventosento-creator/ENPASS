import "server-only";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { hashOpaqueToken } from "@/modules/ticketing/domain/credentials";

export const MEMBER_SESSION_DAYS = 30;

// Una cookie por club (el slug solo tiene a-z, 0-9 y guiones): el mismo socio puede estar en
// varios clubes y entrar a cada perfil por separado.
const cookieName = (slug: string) => `nlm_${slug}`;

export function createMemberSessionCredential() {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashOpaqueToken(raw), expiresAt: new Date(Date.now() + MEMBER_SESSION_DAYS * 86_400_000) };
}

export async function getMemberSessionHash(slug: string) {
  const raw = (await cookies()).get(cookieName(slug))?.value;
  return raw ? hashOpaqueToken(raw) : null;
}

export async function setMemberSessionCookie(slug: string, raw: string, expires: Date) {
  (await cookies()).set(cookieName(slug), raw, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires });
}

export async function clearMemberSessionCookie(slug: string) {
  (await cookies()).set(cookieName(slug), "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
}
