import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decryptCredential, encryptCredential } from "./credential-cipher";

describe("credential cipher", () => {
  const original = process.env.PAYMENT_CREDENTIALS_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.PAYMENT_CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  });

  afterEach(() => {
    if (original === undefined) delete process.env.PAYMENT_CREDENTIALS_ENCRYPTION_KEY;
    else process.env.PAYMENT_CREDENTIALS_ENCRYPTION_KEY = original;
  });

  it("cifra con nonce aleatorio y descifra", () => {
    const first = encryptCredential("token-de-prueba");
    const second = encryptCredential("token-de-prueba");
    expect(first).not.toBe(second);
    expect(decryptCredential(first)).toBe("token-de-prueba");
  });

  it("rechaza una clave de longitud incorrecta", () => {
    process.env.PAYMENT_CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(16).toString("base64");
    expect(() => encryptCredential("token")).toThrow(/32 bytes/);
  });
});
