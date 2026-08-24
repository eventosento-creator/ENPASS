import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decryptTicketToken, encryptTicketToken } from "./ticket-cipher";

describe("ticket token cipher", () => {
  const original = process.env.TICKET_TOKEN_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.TICKET_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 11).toString("base64");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    if (original === undefined) delete process.env.TICKET_TOKEN_ENCRYPTION_KEY;
    else process.env.TICKET_TOKEN_ENCRYPTION_KEY = original;
  });

  it("cifra con AES-256-GCM usando nonces distintos", () => {
    const payload = "NLOS1:opaque-payload";
    const first = encryptTicketToken(payload);
    const second = encryptTicketToken(payload);
    expect(first).not.toBe(second);
    expect(decryptTicketToken(first)).toBe(payload);
  });

  it("rechaza ciphertext manipulado", () => {
    const encrypted = encryptTicketToken("NLOS1:opaque-payload");
    const parts = encrypted.split(".");
    const encodedCiphertext = parts[3];
    if (!encodedCiphertext) throw new Error("Fixture sin ciphertext");
    const ciphertext = Buffer.from(encodedCiphertext, "base64url");
    ciphertext[0] = ciphertext[0]! ^ 1;
    parts[3] = ciphertext.toString("base64url");
    expect(() => decryptTicketToken(parts.join("."))).toThrow();
  });

  it("rechaza una clave incorrecta", () => {
    const encrypted = encryptTicketToken("NLOS1:opaque-payload");
    process.env.TICKET_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 12).toString("base64");
    expect(() => decryptTicketToken(encrypted)).toThrow();
  });

  it("acepta payloads explícitos solamente para fixtures de desarrollo", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(decryptTicketToken("dev:NLOS1:fixture-local")).toBe("NLOS1:fixture-local");
  });

  it("rechaza payloads de desarrollo fuera de development", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => decryptTicketToken("dev:NLOS1:fixture-local")).toThrow(/Formato/);
  });
});
