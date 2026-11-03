import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export const QR_PAYLOAD_PREFIX = "NLOS1:";
const SHORT_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export type TicketCredential = {
  payload: string;
  tokenHash: string;
  shortCode: string;
};

export function generateTicketCredential(): TicketCredential {
  const payload = `${QR_PAYLOAD_PREFIX}${randomBytes(32).toString("base64url")}`;
  return {
    payload,
    tokenHash: hashOpaqueToken(payload),
    shortCode: generateShortCode(),
  };
}

export function generateOpaqueToken() {
  return randomBytes(32).toString("base64url");
}

export function hashOpaqueToken(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function hashEmail(value: string) {
  return hashOpaqueToken(normalizeEmail(value));
}

/** Código de ingreso de 6 dígitos que se manda por mail (se escribe en la misma pantalla en vez de abrir un link). */
export function generateAccessCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Acepta lo que pega la gente ("123 456", "123-456") y devuelve los 6 dígitos, o null si no lo son. */
export function normalizeAccessCode(value: string) {
  const digits = value.replace(/[\s-]/g, "");
  return /^\d{6}$/.test(digits) ? digits : null;
}

/** El código se guarda atado al email: el mismo número en otra cuenta da otro hash. */
export function hashAccessCode(code: string, emailHash: string) {
  return hashOpaqueToken(`${code}:${emailHash}`);
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function opaqueTokenMatches(rawToken: string, expectedHash: string) {
  if (!/^[0-9a-f]{64}$/.test(expectedHash)) return false;
  const calculated = Buffer.from(hashOpaqueToken(rawToken), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return calculated.length === expected.length && timingSafeEqual(calculated, expected);
}

function generateShortCode() {
  const bytes = randomBytes(5);
  const characters = Array.from(bytes, (byte) => SHORT_CODE_ALPHABET[byte % SHORT_CODE_ALPHABET.length]);
  return `N${characters.slice(0, 3).join("")}-${characters.slice(3).join("")}`;
}
