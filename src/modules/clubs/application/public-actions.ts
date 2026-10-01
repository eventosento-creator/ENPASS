"use server";

import { z } from "zod";
import { createClient } from "@/shared/database/server";

export type MembershipRequestState = { error?: string; success?: boolean };

const requestSchema = z.object({
  organizationId: z.string().uuid(),
  categoryId: z.string().uuid(),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: z.email(),
  phone: z.string().max(30).optional(),
  document: z.string().max(20).optional(),
  message: z.string().max(500).optional(),
});

export async function submitMembershipRequest(_: MembershipRequestState, formData: FormData): Promise<MembershipRequestState> {
  const parsed = requestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisá los datos: falta algo o el email no es válido." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_club_membership_request", {
    target_org: parsed.data.organizationId,
    target_category: parsed.data.categoryId,
    target_first_name: parsed.data.firstName,
    target_last_name: parsed.data.lastName,
    target_email: parsed.data.email,
    target_phone: parsed.data.phone ?? null,
    target_document: parsed.data.document ?? null,
    target_message: parsed.data.message ?? null,
  });
  if (error) {
    if (error.message?.includes("DUPLICATE_REQUEST")) return { error: "Ya tenés una solicitud pendiente con ese email. Esperá a que el club la revise." };
    if (error.message?.includes("CLUB_NOT_PUBLIC") || error.message?.includes("CATEGORY_NOT_FOUND")) return { error: "No pudimos enviar tu solicitud." };
    return { error: "No pudimos enviar tu solicitud." };
  }
  return { success: true };
}
