"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { inviteEventCollaborator, removeEventCollaborator } from "./access";

export type CollaboratorActionState = { error?: string; success?: string };

const inviteSchema = z.object({ eventId: z.string().uuid(), email: z.email() });

export async function inviteCollaborator(_: CollaboratorActionState, formData: FormData): Promise<CollaboratorActionState> {
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Ingresá un email válido." };
  try {
    await inviteEventCollaborator(parsed.data.eventId, parsed.data.email);
  } catch {
    return { error: "No pudimos enviar la invitación." };
  }
  revalidatePath(`/app/events/${parsed.data.eventId}`);
  return { success: `Invitación enviada a ${parsed.data.email}.` };
}

export async function removeCollaborator(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  if (!eventId || !userId) return;
  await removeEventCollaborator(eventId, userId);
  revalidatePath(`/app/events/${eventId}`);
}
