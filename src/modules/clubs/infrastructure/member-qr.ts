import { createHmac, timingSafeEqual } from "node:crypto";

// QR dinámico del socio: NLOSM1:<membershipId>.<exp>.<firma>. Se firma con una clave derivada de
// TICKET_TOKEN_ENCRYPTION_KEY (separada por etiqueta) y vence en 90 s, así una captura de pantalla
// no sirve para colar a otra persona. No se guarda nada por socio.
export const MEMBER_QR_PREFIX = "NLOSM1:";
export const MEMBER_QR_TTL_SECONDS = 90;
const QR_PATTERN = /^NLOSM1:([0-9a-f-]{36})\.(\d{10})\.([A-Za-z0-9_-]{22})$/;

function signingKey() {
  const encoded = process.env.TICKET_TOKEN_ENCRYPTION_KEY;
  if (!encoded) throw new Error("TICKET_TOKEN_ENCRYPTION_KEY no está configurada.");
  return createHmac("sha256", Buffer.from(encoded, "base64")).update("member-qr-v1").digest();
}

const sign = (membershipId: string, expires: number) =>
  createHmac("sha256", signingKey()).update(`${membershipId}.${expires}`).digest("base64url").slice(0, 22);

export function createMemberQrPayload(membershipId: string, now = Date.now()) {
  const expires = Math.floor(now / 1000) + MEMBER_QR_TTL_SECONDS;
  return `${MEMBER_QR_PREFIX}${membershipId}.${expires}.${sign(membershipId, expires)}`;
}

export type MemberQrVerification = { ok: true; membershipId: string } | { ok: false; reason: "invalid" | "expired" };

export function verifyMemberQrPayload(payload: string, now = Date.now()): MemberQrVerification {
  const match = QR_PATTERN.exec(payload);
  if (!match) return { ok: false, reason: "invalid" };
  const [, membershipId, expiresText, signature] = match as unknown as [string, string, string, string];
  const expected = Buffer.from(sign(membershipId, Number(expiresText)));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return { ok: false, reason: "invalid" };
  if (Number(expiresText) < Math.floor(now / 1000)) return { ok: false, reason: "expired" };
  return { ok: true, membershipId };
}
