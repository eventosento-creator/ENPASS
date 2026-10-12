import "server-only";

import { createAdminClient } from "@/shared/database/admin";
import { allowRequest, getClientIp } from "@/shared/lib/rate-limit";
import { promotionErrorMessage, type PromotionPreview } from "../domain/promotions";

export type CheckoutPromotion = { code: string; preview: PromotionPreview; message: string | null };

/**
 * Valida un código para mostrarlo en el checkout. No reserva nada: la reserva real vuelve a validar en la base, dentro de la misma
 * transacción que crea la orden. Tiene tope de intentos por cuenta y por IP para que no se pueda adivinar códigos.
 */
export async function previewCheckoutPromotion(input: { eventId: string; code: string; selections: unknown; email: string }): Promise<CheckoutPromotion | null> {
  const code = input.code.trim().slice(0, 40);
  if (!code) return null;
  const withinLimit = (await allowRequest("promo_preview_account", input.email.toLowerCase(), 40, 600)) && (await allowRequest("promo_preview_ip", await getClientIp(), 80, 600));
  if (!withinLimit) return { code, preview: { valid: false, error: "RATE_LIMITED" }, message: promotionErrorMessage("RATE_LIMITED") };
  const { data, error } = await createAdminClient().rpc("preview_promotion", { target_event: input.eventId, target_code: code, selections: input.selections, buyer_email: input.email });
  const preview = (error || !data ? { valid: false, error: "UNKNOWN" } : data) as PromotionPreview;
  return { code: preview.code ?? code.toUpperCase(), preview, message: preview.valid ? null : promotionErrorMessage(preview.error, { min: preview.min, max: preview.max }) };
}
