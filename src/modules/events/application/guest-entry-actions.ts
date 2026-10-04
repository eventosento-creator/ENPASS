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
