import "server-only";

/**
 * Cuenta de Mercado Pago PROPIA de ENPASS, usada cuando un club está en modalidad "ENPASS cobra":
 * el pago de la cuota entra a esta cuenta y ENPASS le entrega la cuota completa al club en la liquidación.
 * Se carga como variables de entorno (nunca en el código):
 *  - MERCADO_PAGO_PLATFORM_ACCESS_TOKEN: access token de producción de la cuenta de ENPASS.
 *  - MERCADO_PAGO_PLATFORM_USER_ID: id de usuario de esa cuenta en Mercado Pago (llega como user_id en los webhooks).
 */
export function getPlatformMercadoPago(): { accessToken: string; userId: string } | null {
  const accessToken = process.env.MERCADO_PAGO_PLATFORM_ACCESS_TOKEN?.trim();
  const userId = process.env.MERCADO_PAGO_PLATFORM_USER_ID?.trim();
  return accessToken && userId ? { accessToken, userId } : null;
}
