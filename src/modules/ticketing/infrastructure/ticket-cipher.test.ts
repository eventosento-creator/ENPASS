import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decryptTicketToken, encryptTicketToken } from "./ticket-cipher";

describe("ticket token cipher", () => {
  const original = process.env.TICKET_TOKEN_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.TICKET_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 11).toString("base64");
  });

  afterEach(() => {
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
    expect(() => decryptTicketToken(`${encrypted.slice(0, -1)}x`)).toThrow();
  });

  it("rechaza una clave incorrecta", () => {
    const encrypted = encryptTicketToken("NLOS1:opaque-payload");
    process.env.TICKET_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 12).toString("base64");
    expect(() => decryptTicketToken(encrypted)).toThrow();
  });
});
