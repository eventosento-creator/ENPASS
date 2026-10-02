import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => { process.env.TICKET_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64"); });

describe("member qr", () => {
  it("firma, verifica y vence", async () => {
    const { createMemberQrPayload, verifyMemberQrPayload } = await import("./member-qr");
    const id = "d08317ce-4b71-4ca4-bc62-bf0bcf949ba2";
    const payload = createMemberQrPayload(id, 1_000_000_000_000);
    expect(verifyMemberQrPayload(payload, 1_000_000_010_000)).toEqual({ ok: true, membershipId: id });
    expect(verifyMemberQrPayload(payload, 1_000_000_100_000)).toEqual({ ok: false, reason: "expired" });
    expect(verifyMemberQrPayload(payload.replace(id.slice(0, 4), "ffff"), 1_000_000_010_000)).toEqual({ ok: false, reason: "invalid" });
    expect(verifyMemberQrPayload("NLOS1:abc", 0)).toEqual({ ok: false, reason: "invalid" });
  });
});
