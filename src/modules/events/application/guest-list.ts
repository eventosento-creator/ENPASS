import "server-only";

import { createClient } from "@/shared/database/server";

export type GuestListEntry = { name: string; document: string | null; typeLabel: string; checkedIn: boolean };

/** Lista de asistentes de un evento (una fila por entrada vigente), ordenada por apellido. null si el usuario no puede ver el evento. */
export async function getEventGuestList(eventId: string) {
  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("id, name, slug, starts_at").eq("id", eventId).single();
  if (!event) return null;
  const [{ data: tickets }, { data: ticketTypes }] = await Promise.all([
    // Solo columnas con permiso de lectura (las del QR están bloqueadas a propósito).
    supabase.from("tickets").select("ticket_type_id, holder_first_name, holder_last_name, holder_document, used_entries").eq("event_id", eventId).eq("status", "valid").order("holder_last_name"),
    supabase.from("ticket_types").select("id, name").eq("event_id", eventId),
  ]);
  const typeNameById = new Map((ticketTypes ?? []).map((type) => [type.id, type.name]));
  const guests: GuestListEntry[] = (tickets ?? []).map((ticket) => ({
    name: `${ticket.holder_last_name}, ${ticket.holder_first_name}`.replace(/^, |, $/g, "").trim() || "Sin nombre",
    document: ticket.holder_document,
    typeLabel: ticket.ticket_type_id ? (typeNameById.get(ticket.ticket_type_id) ?? "Entrada") : "Entrada",
    checkedIn: ticket.used_entries > 0,
  })).sort((a, b) => a.name.localeCompare(b.name, "es-AR"));
  return { event, guests };
}
