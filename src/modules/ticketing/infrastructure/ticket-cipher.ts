import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";

export function encryptTicketToken(value: string) {
  if (!value) throw new Error("No se puede cifrar un token vacío.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [
    VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptTicketToken(value: string) {
  if (process.env.NODE_ENV === "development" && value.startsWith("dev:")) {
    return value.slice(4);
  }
  const [version, encodedIv, encodedTag, encodedCiphertext] = value.split(".");
  if (version !== VERSION || !encodedIv || !encodedTag || !encodedCiphertext) {
    throw new Error("Formato de token cifrado inválido.");
  }

  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(encodedIv, "base64url"));
  decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function encryptionKey() {
  const encoded = process.env.TICKET_TOKEN_ENCRYPTION_KEY;
  if (!encoded) throw new Error("TICKET_TOKEN_ENCRYPTION_KEY no está configurada.");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("TICKET_TOKEN_ENCRYPTION_KEY debe contener exactamente 32 bytes.");
  return key;
}
