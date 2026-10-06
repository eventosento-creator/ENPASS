export const BUYER_ACCESS_PUBLIC_MESSAGE = "Te enviamos un link a tu email para ingresar. Si no lo ves, revisá spam.";

export function buyerAccessPublicResult(outcome: "sent" | "not_found" | "failed") {
  void outcome;
  return { message: BUYER_ACCESS_PUBLIC_MESSAGE };
}

export function isAccessTokenActive(
  access: { expiresAt: Date; exchangedAt: Date | null; revokedAt: Date | null },
  now = new Date(),
) {
  return access.expiresAt.getTime() > now.getTime() && access.exchangedAt === null && access.revokedAt === null;
}
