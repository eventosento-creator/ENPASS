import { describe, expect, it } from "vitest";
import { BUYER_ACCESS_PUBLIC_MESSAGE, buyerAccessPublicResult, isAccessTokenActive } from "./buyer-access-policy";

describe("buyer access policy", () => {
  it("no permite enumerar emails por la respuesta pública", () => {
    expect(buyerAccessPublicResult("sent")).toEqual({ message: BUYER_ACCESS_PUBLIC_MESSAGE });
    expect(buyerAccessPublicResult("not_found")).toEqual(buyerAccessPublicResult("sent"));
    expect(buyerAccessPublicResult("failed")).toEqual(buyerAccessPublicResult("sent"));
  });

  it("acepta solo tokens vigentes, no usados y no revocados", () => {
    const now = new Date("2026-08-22T12:00:00Z");
    expect(isAccessTokenActive({ expiresAt: new Date("2026-08-22T12:15:00Z"), exchangedAt: null, revokedAt: null }, now)).toBe(true);
    expect(isAccessTokenActive({ expiresAt: now, exchangedAt: null, revokedAt: null }, now)).toBe(false);
    expect(isAccessTokenActive({ expiresAt: new Date("2026-08-22T12:15:00Z"), exchangedAt: now, revokedAt: null }, now)).toBe(false);
    expect(isAccessTokenActive({ expiresAt: new Date("2026-08-22T12:15:00Z"), exchangedAt: null, revokedAt: now }, now)).toBe(false);
  });
});
