import "server-only";

import { headers } from "next/headers";
import { createAdminClient } from "@/shared/database/admin";

/** IP de quien hace el pedido (Vercel la pasa en x-forwarded-for). "local" si no hay (desarrollo). */
export async function getClientIp() {
  const requestHeaders = await headers();
  return requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || "local";
}

/**
 * Cuenta un pedido contra un tope. Devuelve false si ya superó `max` en `windowSeconds`.
 * Si el contador falla, deja pasar (mejor no bloquear a una persona real por un problema nuestro) y queda en los logs.
 */
export async function allowRequest(scope: string, key: string, max: number, windowSeconds: number) {
  try {
    const { data, error } = await createAdminClient().rpc("check_rate_limit", { target_scope: scope, target_key: key, max_hits: max, window_seconds: windowSeconds });
    if (error) throw error;
    return data !== false;
  } catch (error) {
    console.error(JSON.stringify({ event: "rate_limit.check_failed", scope, message: error instanceof Error ? error.message : String(error) }));
    return true;
  }
}

export const RATE_LIMIT_MESSAGE = "Hiciste muchos intentos en poco tiempo. Esperá un rato y volvé a probar.";
