import "server-only";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { hashOpaqueToken } from "@/modules/ticketing/domain/credentials";

export const CLUB_DOOR_COOKIE = "nlos_club_door";

export function createClubDoorCredential() {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashOpaqueToken(raw) };
}

export async function getClubDoorSessionHash() {
  const raw = (await cookies()).get(CLUB_DOOR_COOKIE)?.value;
  return raw ? hashOpaqueToken(raw) : null;
}

export async function setClubDoorCookie(raw: string, expiresAt: string) {
  (await cookies()).set(CLUB_DOOR_COOKIE, raw, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: new Date(expiresAt) });
}

export async function clearClubDoorCookie() {
  (await cookies()).set(CLUB_DOOR_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
}
