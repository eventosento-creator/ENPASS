import "server-only";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { SCANNER_SESSION_COOKIE } from "../domain/scanner";
import { hashOpaqueToken } from "@/modules/ticketing/domain/credentials";

export function createScannerSessionCredential() {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashOpaqueToken(raw) };
}

export async function getScannerSessionHash() {
  const raw = (await cookies()).get(SCANNER_SESSION_COOKIE)?.value;
  return raw ? hashOpaqueToken(raw) : null;
}

export async function setScannerSessionCookie(raw: string, expiresAt: string) {
  const expires = new Date(expiresAt);
  (await cookies()).set(SCANNER_SESSION_COOKIE, raw, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires,
  });
}

export async function clearScannerSessionCookie() {
  (await cookies()).set(SCANNER_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}
