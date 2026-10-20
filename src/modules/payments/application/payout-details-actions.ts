"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/shared/database/server";

export type PayoutDetailsState = { error?: string; success?: string };

const schema = z.object({
  organizationId: z.string().uuid(),
  holder: z.string().trim().max(120).optional(),
  cuit: z.string().trim().optional(),
  alias: z.string().trim().optional(),
  cbu: z.string().trim().optional(),
});

/** El productor carga a dónde quiere recibir las liquidaciones de las ventas por transferencia. */
export async function updateOrgPayoutDetails(_: PayoutDetailsState, formData: FormData): Promise<PayoutDetailsState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisá los datos." };
  const cuit = (parsed.data.cuit ?? "").replace(/\D/g, "");
  const cbu = (parsed.data.cbu ?? "").replace(/\D/g, "");
  const alias = parsed.data.alias ?? "";
  if (cuit && cuit.length !== 11) return { error: "El CUIT tiene 11 números." };
  if (cbu && cbu.length !== 22) return { error: "El CBU/CVU tiene 22 números." };
  if (alias && !/^[A-Za-z0-9.-]{6,20}$/.test(alias)) return { error: "El alias tiene entre 6 y 20 caracteres (letras, números, punto o guion)." };
  if (!alias && !cbu) return { error: "Cargá al menos el alias o el CBU/CVU." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_org_payout_details", { target_org: parsed.data.organizationId, target_holder: parsed.data.holder ?? null, target_cuit: cuit || null, target_alias: alias || null, target_cbu: cbu || null });
  if (error) return { error: "No pudimos guardar los datos." };
  revalidatePath("/app/settings/liquidaciones");
  return { success: "Datos guardados." };
}
