"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/shared/database/server";
import type { ActionState } from "@/modules/identity/application/actions";

const notesSchema = z.object({
  customerId: z.uuid(),
  notes: z.string().trim().max(2000).default(""),
  tags: z.string().trim().max(300).default(""),
});

export async function updateCustomerNotes(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = notesSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisá las notas y las etiquetas." };
  const tags = parsed.data.tags.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 20);

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_customer_notes", {
    target_customer: parsed.data.customerId,
    target_notes: parsed.data.notes,
    target_tags: tags,
  });
  if (error) return { error: "No pudimos guardar los cambios." };

  revalidatePath(`/app/clientes/${parsed.data.customerId}`);
  return { success: "Guardado." };
}
