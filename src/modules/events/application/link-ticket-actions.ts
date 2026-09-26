"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/shared/database/server";
import { pesosToMinorUnits } from "../domain/event";

const dateInput = z.string().trim().default("");

// "datetime-local" values carry no zone: they are always Argentina time (UTC-3, no daylight saving).
function argentinaDate(value: string) {
  if (!value) return null;
  const parsed = new Date(`${value.length === 16 ? `${value}:00` : value}-03:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function back(eventId: string, kind: "notice" | "error", message: string): never {
  revalidatePath(`/app/events/${eventId}/tickets`);
  redirect(`/app/events/${eventId}/tickets?link${kind}=${encodeURIComponent(message)}` as never);
}

const createSchema = z.object({
  eventId: z.uuid(), name: z.string().trim().min(1).max(100),
  pricePesos: z.coerce.number().nonnegative().multipleOf(1), quantity: z.coerce.number().int().positive(),
  maxPerOrder: z.coerce.number().int().min(1).max(20),
  salesStart: dateInput, salesEnd: dateInput,
});

export async function createLinkTicketType(formData: FormData) {
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  const eventId = String(formData.get("eventId") ?? "");
  if (!parsed.success) { if (z.uuid().safeParse(eventId).success) back(eventId, "error", "Revisá nombre, precio, cantidad y máximo por compra."); return; }
  const start = argentinaDate(parsed.data.salesStart);
  const end = argentinaDate(parsed.data.salesEnd);
  if (start === undefined || end === undefined) back(parsed.data.eventId, "error", "Revisá las fechas de habilitación.");
  if (start && end && end <= start) back(parsed.data.eventId, "error", "La hora de cierre tiene que ser posterior a la de apertura.");
  if (end && end <= new Date()) back(parsed.data.eventId, "error", "La hora de cierre ya pasó.");

  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("organization_id").eq("id", parsed.data.eventId).single();
  if (!event) back(parsed.data.eventId, "error", "No encontramos el evento.");
  const { data: last } = await supabase.from("ticket_types").select("sort_order").eq("event_id", parsed.data.eventId).order("sort_order", { ascending: false }).limit(1);
  const { error } = await supabase.from("ticket_types").insert({
    organization_id: event.organization_id, event_id: parsed.data.eventId, name: parsed.data.name, sale_phase_id: null,
    description: "", price_amount: pesosToMinorUnits(parsed.data.pricePesos), currency: "ARS", quantity: parsed.data.quantity,
    max_per_order: parsed.data.maxPerOrder, sales_start: start ? start.toISOString() : null, sales_end: end ? end.toISOString() : null,
    active: true, sort_order: (last?.[0]?.sort_order ?? -1) + 1, link_only: true, link_token: randomBytes(18).toString("base64url"),
  });
  if (error) back(parsed.data.eventId, "error", error.code === "23505" ? "Ya existe una entrada con ese nombre en este evento." : "No pudimos crear la entrada por link.");
  back(parsed.data.eventId, "notice", "Entrada por link creada. Copiá el link o el QR de abajo.");
}

export async function updateLinkTicketWindow(formData: FormData) {
  const parsed = z.object({ eventId: z.uuid(), ticketTypeId: z.uuid(), salesStart: dateInput, salesEnd: dateInput }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const start = argentinaDate(parsed.data.salesStart);
  const end = argentinaDate(parsed.data.salesEnd);
  if (start === undefined || end === undefined) back(parsed.data.eventId, "error", "Revisá las fechas de habilitación.");
  if (start && end && end <= start) back(parsed.data.eventId, "error", "La hora de cierre tiene que ser posterior a la de apertura.");
  const supabase = await createClient();
  const { error } = await supabase.from("ticket_types").update({ sales_start: start ? start.toISOString() : null, sales_end: end ? end.toISOString() : null })
    .eq("id", parsed.data.ticketTypeId).eq("event_id", parsed.data.eventId).eq("link_only", true);
  if (error) back(parsed.data.eventId, "error", "No pudimos guardar el horario.");
  back(parsed.data.eventId, "notice", "Horario actualizado. El link y el QR son los mismos.");
}

export async function setLinkTicketActive(formData: FormData) {
  const parsed = z.object({ eventId: z.uuid(), ticketTypeId: z.uuid(), active: z.enum(["true", "false"]) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const supabase = await createClient();
  const { error } = await supabase.from("ticket_types").update({ active: parsed.data.active === "true" }).eq("id", parsed.data.ticketTypeId).eq("event_id", parsed.data.eventId).eq("link_only", true);
  if (error) back(parsed.data.eventId, "error", "No pudimos actualizar la entrada.");
  back(parsed.data.eventId, "notice", parsed.data.active === "true" ? "Entrada reactivada." : "Entrada desactivada: el link deja de funcionar.");
}

export async function deleteLinkTicketType(formData: FormData) {
  const parsed = z.object({ eventId: z.uuid(), ticketTypeId: z.uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const supabase = await createClient();
  const { error } = await supabase.from("ticket_types").delete().eq("id", parsed.data.ticketTypeId).eq("event_id", parsed.data.eventId).eq("link_only", true);
  if (error) back(parsed.data.eventId, "error", "Esa entrada ya tiene ventas o reservas, no se puede borrar. Desactivala para cerrar el link.");
  back(parsed.data.eventId, "notice", "Entrada por link eliminada.");
}
