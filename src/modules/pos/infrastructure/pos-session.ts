import "server-only";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { hashOpaqueToken } from "@/modules/ticketing/domain/credentials";
import { POS_SESSION_COOKIE } from "../domain/pos";

export function createPosSessionCredential() {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashOpaqueToken(raw) };
}

export async function getPosSessionHash() {
  const raw = (await cookies()).get(POS_SESSION_COOKIE)?.value;
  return raw ? hashOpaqueToken(raw) : null;
}

export async function setPosSessionCookie(raw: string, expiresAt: string) {
  (await cookies()).set(POS_SESSION_COOKIE, raw, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export async function clearPosSessionCookie() {
  (await cookies()).set(POS_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}
