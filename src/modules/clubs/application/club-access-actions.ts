"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/shared/database/server";

export type ClubAccessState = { error?: string; success?: string; pin?: string };

const deviceSchema = z.object({ organizationId: z.uuid(), name: z.string().trim().min(2).max(80) });

export async function createClubDoorDevice(_: ClubAccessState, formData: FormData): Promise<ClubAccessState> {
  const parsed = deviceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Poné un nombre para la puerta (ej. Entrada principal)." };
  const supabase = await createClient();
  const codeExpires = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const pin = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const { error } = await supabase.rpc("create_club_door_device", {
      target_org: parsed.data.organizationId, device_name: parsed.data.name, target_pin: pin, target_code_expires_at: codeExpires,
    });
    if (!error) {
      revalidatePath("/app/socios/acceso");
      return { success: "Puerta creada. Copiá el PIN ahora: no vuelve a mostrarse.", pin };
    }
    if (!error.message.includes("PIN_COLLISION")) return { error: "No pudimos crear la puerta." };
  }
  return { error: "No pudimos generar un PIN único. Intentá nuevamente." };
}

export async function revokeClubDoorDevice(formData: FormData) {
  const deviceId = formData.get("deviceId");
  if (typeof deviceId !== "string") return;
  const supabase = await createClient();
  await supabase.rpc("revoke_club_door_device", { target_device: deviceId });
  revalidatePath("/app/socios/acceso");
}

export async function setClubDebtBlocksEntry(formData: FormData) {
  const organizationId = formData.get("organizationId");
  if (typeof organizationId !== "string") return;
  const supabase = await createClient();
  await supabase.rpc("set_club_debt_blocks_entry", { target_org: organizationId, target_blocks: formData.get("blocks") === "true" });
  revalidatePath("/app/socios/acceso");
}
