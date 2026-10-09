"use server";

import { z } from "zod";
import { createAdminClient } from "@/shared/database/admin";
import { allowRequest, getClientIp, RATE_LIMIT_MESSAGE } from "@/shared/lib/rate-limit";

export type MembershipRequestState = { error?: string; success?: boolean };

const requestSchema = z.object({
  organizationId: z.string().uuid(),
  categoryId: z.string().uuid(),
  divisionId: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: z.email(),
  phone: z.string().max(30).optional(),
  document: z.string().max(20).optional(),
  message: z.string().max(500).optional(),
});

export async function submitMembershipRequest(_: MembershipRequestState, formData: FormData): Promise<MembershipRequestState> {
  // Campo trampa: las personas no lo ven ni lo completan; los bots que llenan todo, sí. Se responde "ok" sin guardar nada.
  if (String(formData.get("website") ?? "").trim() !== "") return { success: true };
  const parsed = requestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisá los datos: falta algo o el email no es válido." };
  const ip = await getClientIp();
  const email = parsed.data.email.toLowerCase();
  const within = (await allowRequest("club_request_ip", ip, 6, 3600))
    && (await allowRequest("club_request_email", email, 3, 3600))
    && (await allowRequest("club_request_org", parsed.data.organizationId, 80, 3600));
  if (!within) return { error: RATE_LIMIT_MESSAGE };
  const { error } = await createAdminClient().rpc("submit_club_membership_request", {
    target_org: parsed.data.organizationId,
    target_category: parsed.data.categoryId,
    target_first_name: parsed.data.firstName,
    target_last_name: parsed.data.lastName,
    target_email: parsed.data.email,
    target_phone: parsed.data.phone ?? null,
    target_document: parsed.data.document ?? null,
    target_message: parsed.data.message ?? null,
    target_division: parsed.data.divisionId ?? null,
  });
  if (error) {
    if (error.message?.includes("DUPLICATE_REQUEST")) return { error: "Ya tenés una solicitud pendiente con ese email. Esperá a que el club la revise." };
    if (error.message?.includes("CLUB_NOT_PUBLIC") || error.message?.includes("CATEGORY_NOT_FOUND") || error.message?.includes("DIVISION_NOT_FOUND")) return { error: "No pudimos enviar tu solicitud." };
    return { error: "No pudimos enviar tu solicitud." };
  }
  return { success: true };
}
