import "server-only";

import { cookies } from "next/headers";
import { hashOpaqueToken } from "@/modules/ticketing/domain/credentials";
import {
  isOpaqueCredential,
  PROMOTER_ATTRIBUTION_COOKIE,
  PROMOTER_SESSION_COOKIE,
} from "../domain/session";

export async function getPromoterAttributionCredential() {
  const raw = (await cookies()).get(PROMOTER_ATTRIBUTION_COOKIE)?.value;
  return isOpaqueCredential(raw) ? raw : null;
}

export async function getPromoterAttributionSessionHash() {
  const raw = await getPromoterAttributionCredential();
  return raw ? hashOpaqueToken(raw) : null;
}

export async function getPromoterSessionHash() {
  const raw = (await cookies()).get(PROMOTER_SESSION_COOKIE)?.value;
  return isOpaqueCredential(raw) ? hashOpaqueToken(raw) : null;
}

export async function clearPromoterSessionCookie() {
  (await cookies()).set(PROMOTER_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}
