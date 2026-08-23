import { describe, expect, it } from "vitest";
import { generateOpaqueToken, generateTicketCredential, hashEmail, hashOpaqueToken, opaqueTokenMatches, QR_PAYLOAD_PREFIX } from "./credentials";

describe("ticket credentials", () => {
  it("genera payloads versionados de 256 bits y códigos visuales únicos", () => {
    const credentials = Array.from({ length: 100 }, () => generateTicketCredential());
    expect(new Set(credentials.map((credential) => credential.payload)).size).toBe(100);
    expect(new Set(credentials.map((credential) => credential.shortCode)).size).toBe(100);
    for (const credential of credentials) {
      expect(credential.payload.startsWith(QR_PAYLOAD_PREFIX)).toBe(true);
      expect(Buffer.from(credential.payload.slice(QR_PAYLOAD_PREFIX.length), "base64url")).toHaveLength(32);
      expect(credential.tokenHash).toBe(hashOpaqueToken(credential.payload));
      expect(credential.shortCode).toMatch(/^N[A-Z0-9]{3}-[A-Z0-9]{2}$/);
    }
  });

  it("detecta tokens manipulados con comparación segura", () => {
    const token = generateOpaqueToken();
    const hash = hashOpaqueToken(token);
    expect(opaqueTokenMatches(token, hash)).toBe(true);
    expect(opaqueTokenMatches(`${token}x`, hash)).toBe(false);
    expect(opaqueTokenMatches(token, "not-a-hash")).toBe(false);
  });

  it("normaliza el email antes de hashearlo", () => {
    expect(hashEmail(" Buyer@Example.COM ")).toBe(hashEmail("buyer@example.com"));
  });
});
