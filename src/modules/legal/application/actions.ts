"use server";

import { createAdminClient } from "@/shared/database/admin";
import { generateOpaqueToken, hashOpaqueToken } from "@/modules/ticketing/domain/credentials";
import { SmtpEmailProvider } from "@/modules/ticketing/infrastructure/smtp-email-provider";
import { legalLog } from "@/shared/lib/structured-log";
import { startArrepentimientoSchema, confirmArrepentimientoSchema } from "../domain/legal";
import type { ActionState } from "@/modules/identity/application/actions";

const GENERIC_SUCCESS = "Si existe una compra con esos datos, te enviamos un email para continuar.";
const VERIFICATION_TTL_MS = 30 * 60_000;

export async function startArrepentimiento(_: ActionState, formData: FormData): Promise<ActionState> {
  const provider = new SmtpEmailProvider();
  const parsed = startArrepentimientoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisá el email y el código de tu compra." };

  const rawToken = generateOpaqueToken();
  const tokenHash = hashOpaqueToken(rawToken);
  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("start_arrepentimiento_request", {
    order_public_id: parsed.data.orderPublicId,
    requester_email: parsed.data.email,
    verification_token_hash: tokenHash,
    verification_expires_at: expiresAt.toISOString(),
  });
  const result = data?.[0];
  legalLog("arrepentimiento.requested", { matched: Boolean(result?.matched) });

  if (!error && result?.matched) {
    try {
      const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
      if (appUrl) {
        const confirmUrl = new URL("/arrepentimiento/confirmar", appUrl);
        confirmUrl.searchParams.set("token", rawToken);
        await provider.sendArrepentimientoVerification({ to: parsed.data.email, confirmUrl: confirmUrl.toString() });
      }
    } catch {
      // Enumeration-safe by design: delivery failure never changes the public response.
    }
  }
  return { success: GENERIC_SUCCESS };
}

export async function confirmArrepentimiento(_: ActionState, formData: FormData): Promise<ActionState & { managementCode?: string; eligible?: boolean; reason?: string }> {
  const provider = new SmtpEmailProvider();
  const parsed = confirmArrepentimientoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "El enlace no es válido." };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("confirm_arrepentimiento_request", { raw_token: parsed.data.token });
  const result = data?.[0];
  if (error || !result) return { error: "Este enlace venció o ya fue utilizado." };

  legalLog("arrepentimiento.confirmed", { eligibilityStatus: result.eligibility_status });

  try {
    const { data: requestRow } = await admin.from("arrepentimiento_requests").select("requester_email").eq("management_code", result.management_code).single();
    if (requestRow?.requester_email) {
      await provider.sendArrepentimientoReceived({
        to: requestRow.requester_email,
        managementCode: result.management_code,
        eligible: result.eligibility_status === "ELIGIBLE",
        reason: result.ineligibility_reason,
      });
    }
  } catch {
    // The on-screen result already reflects the outcome; email delivery is best-effort.
  }

  return {
    success: result.eligibility_status === "ELIGIBLE" ? "Tu solicitud fue registrada." : "Tu solicitud fue registrada, pero no cumple las condiciones para el reembolso automático.",
    managementCode: result.management_code,
    eligible: result.eligibility_status === "ELIGIBLE",
    reason: result.ineligibility_reason ?? undefined,
  };
}
