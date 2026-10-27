"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/shared/database/server";

export type GuestEntryResult = { error?: string; usedEntries?: number; maxEntries?: number };

const schema = z.object({ ticketId: z.uuid(), eventId: z.uuid() });

async function run(rpc: "mark_ticket_entry" | "undo_ticket_entry", input: unknown): Promise<GuestEntryResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "Datos inválidos." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(rpc, { target_ticket: parsed.data.ticketId });
  if (error) {
    if (error.message.includes("ALREADY_USED")) return { error: "Esta entrada ya ingresó." };
    if (error.message.includes("TICKET_NOT_VALID")) return { error: "La entrada está cancelada o reembolsada." };
    if (error.message.includes("NOTHING_TO_UNDO")) return { error: "No hay un ingreso manual para deshacer (el ingreso lo leyó un scanner)." };
    if (error.message.includes("NOT_ALLOWED")) return { error: "No tenés permiso." };
    return { error: "No pudimos registrar el cambio. Probá de nuevo." };
  }
  revalidatePath(`/app/events/${parsed.data.eventId}/guests`);
  const result = data as { used_entries?: number; max_entries?: number } | null;
  return { usedEntries: result?.used_entries, maxEntries: result?.max_entries };
}

export async function markGuestEntry(ticketId: string, eventId: string): Promise<GuestEntryResult> {
  return run("mark_ticket_entry", { ticketId, eventId });
}

export async function undoGuestEntry(ticketId: string, eventId: string): Promise<GuestEntryResult> {
  return run("undo_ticket_entry", { ticketId, eventId });
}

export type GuestHolderResult = { error?: string };

const holderSchema = z.object({
  ticketId: z.uuid(), eventId: z.uuid(),
  firstName: z.string().trim().min(1, "Escribí el nombre.").max(80),
  lastName: z.string().trim().min(1, "Escribí el apellido.").max(80),
  document: z.string().trim().max(30).default("").transform((value) => value.replace(/[.\s-]/g, "")),
});

/** El productor corrige el titular de una entrada desde Invitados. */
export async function updateGuestHolder(input: { ticketId: string; eventId: string; firstName: string; lastName: string; document: string }): Promise<GuestHolderResult> {
  const parsed = holderSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revisá los datos." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_ticket_holder_as_manager", { target_ticket: parsed.data.ticketId, target_first_name: parsed.data.firstName, target_last_name: parsed.data.lastName, target_document: parsed.data.document || null });
  if (error) {
    if (error.message.includes("DOCUMENT_REQUIRED")) return { error: "Este evento pide el DNI de cada persona." };
    if (error.message.includes("INVALID_DOCUMENT")) return { error: "El DNI no es válido: ingresá solo números." };
    if (error.message.includes("NOT_EDITABLE")) return { error: "Esta entrada no se puede editar (está anulada, reembolsada o es una mesa)." };
    if (error.message.includes("NOT_ALLOWED")) return { error: "No tenés permiso." };
    return { error: "No pudimos cambiar el nombre. Probá de nuevo." };
  }
  revalidatePath(`/app/events/${parsed.data.eventId}/guests`);
  return {};
}
