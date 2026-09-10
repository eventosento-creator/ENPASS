"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fromZonedTime } from "date-fns-tz";
import { z } from "zod";
import { createClient } from "@/shared/database/server";
import { slugify } from "@/shared/lib/format";
import { eventConfigurationSchema, eventInputSchema, eventUpdateSchema, pesosToMinorUnits, ticketTypeInputSchema, ticketTypeUpdateSchema } from "../domain/event";
import type { ActionState } from "@/modules/identity/application/actions";
import { sendEventReminders } from "@/modules/ticketing/application/send-event-reminders";
import { notifyEventChange } from "@/modules/ticketing/application/notify-event-change";

export async function sendEventReminderAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const eventId = formData.get("eventId");
  if (typeof eventId !== "string") return { error: "Evento inválido." };
  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("id").eq("id", eventId).maybeSingle();
  if (!event) return { error: "No tenés permiso sobre este evento." };
  try {
    const result = await sendEventReminders(eventId);
    revalidatePath(`/app/events/${eventId}`);
    if (!result.total) return { error: "Todavía no hay compradores con entradas válidas para este evento." };
    return { success: `Recordatorio enviado a ${result.sent} de ${result.total} compradores.` };
  } catch {
    return { error: "No pudimos enviar los recordatorios. Intentá de nuevo." };
  }
}

export async function createEvent(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = eventInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisá el nombre, lugar, fecha y hora." };
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return { error: "Tu sesión venció." };
  const { data: venue } = await supabase.from("venues").select("timezone, capacity").eq("id", parsed.data.venueId).eq("organization_id", parsed.data.organizationId).single();
  if (!venue) return { error: "El lugar no pertenece a tu organización." };
  const eventCapacity = parsed.data.capacity ?? venue.capacity;
  if (eventCapacity > venue.capacity) return { error: "La capacidad del evento supera la del lugar." };
  const startsAtDate = fromZonedTime(parsed.data.startsAt, venue.timezone);
  if (Number.isNaN(startsAtDate.getTime())) return { error: "La fecha y hora no son válidas." };
  const startsAt = startsAtDate.toISOString();
  if (startsAtDate.getTime() <= Date.now()) return { error: "La fecha del evento debe ser futura." };
  let endsAt: string | null = null;
  if (parsed.data.endsAt) {
    const endsAtDate = fromZonedTime(parsed.data.endsAt, venue.timezone);
    if (Number.isNaN(endsAtDate.getTime())) return { error: "La fecha y hora de fin no son válidas." };
    if (endsAtDate.getTime() <= startsAtDate.getTime()) return { error: "El fin del evento debe ser posterior al inicio." };
    endsAt = endsAtDate.toISOString();
  }
  const eventId = crypto.randomUUID();
  const cover = formData.get("cover");
  let coverImageUrl: string | null = null;
  let uploadedPath: string | null = null;
  if (cover instanceof File && cover.size > 0) {
    const validationError = validateCover(cover);
    if (validationError) return { error: validationError };
    const extension = cover.type === "image/png" ? "png" : cover.type === "image/webp" ? "webp" : "jpg";
    uploadedPath = `${parsed.data.organizationId}/${eventId}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from("event-covers").upload(uploadedPath, cover, { contentType: cover.type, cacheControl: "3600" });
    if (uploadError) {
      console.error(JSON.stringify({ level: "error", event: "event.create.cover.failed", code: uploadError.name }));
      return { error: "No pudimos subir el flyer. Probá con una imagen más liviana o continuá sin flyer." };
    }
    coverImageUrl = supabase.storage.from("event-covers").getPublicUrl(uploadedPath).data.publicUrl;
  }
  const { data, error } = await supabase.from("events").insert({
    id: eventId,
    organization_id: parsed.data.organizationId, venue_id: parsed.data.venueId,
    name: parsed.data.name, slug: `${slugify(parsed.data.name)}-${crypto.randomUUID().slice(0, 6)}`,
    description: parsed.data.description, starts_at: startsAt, doors_open_at: null, ends_at: endsAt,
    status: "draft", capacity: eventCapacity, require_document: parsed.data.requireDocument,
    profile: parsed.data.profile,
    discovery_category: parsed.data.discoveryCategory,
    tickets_enabled: parsed.data.ticketsEnabled,
    promoters_enabled: parsed.data.promotersEnabled,
    tables_enabled: parsed.data.tablesEnabled,
    seatmap_enabled: parsed.data.seatmapEnabled,
    access_enabled: parsed.data.accessEnabled,
    pos_enabled: parsed.data.posEnabled,
    inventory_enabled: false,
    currency: "ARS", cover_image_url: coverImageUrl, created_by: user.user.id,
  }).select("id").single();
  if (error || !data) {
    if (uploadedPath) await supabase.storage.from("event-covers").remove([uploadedPath]);
    console.error(JSON.stringify({ level: "error", event: "event.create.failed", code: error?.code, detail: error?.message }));
    return { error: eventMutationError(error?.message) };
  }
  redirect(`/app/events/new?step=${parsed.data.ticketsEnabled ? 2 : 3}&event=${data.id}`);
}

export async function updateEventConfiguration(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = eventConfigurationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisá el tipo y las funciones del evento." };
  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("slug, inventory_enabled").eq("id", parsed.data.eventId).single();
  if (!event) return { error: "No encontramos el evento." };
  const { error } = await supabase.rpc("update_event_configuration", {
    target_event: parsed.data.eventId,
    target_profile: parsed.data.profile,
    target_tickets_enabled: parsed.data.ticketsEnabled,
    target_promoters_enabled: parsed.data.promotersEnabled,
    target_tables_enabled: parsed.data.tablesEnabled,
    target_access_enabled: parsed.data.accessEnabled,
    target_pos_enabled: parsed.data.posEnabled,
    target_inventory_enabled: event.inventory_enabled,
    target_seatmap_enabled: parsed.data.seatmapEnabled,
  });
  if (error?.message.includes("OPEN_POS_SESSIONS")) return { error: "Cerrá las cajas abiertas antes de desactivar esta función." };
  if (error) return { error: "No pudimos guardar las funciones del evento." };
  revalidatePath(`/app/events/${parsed.data.eventId}`);
  revalidatePath(`/app/events/${parsed.data.eventId}/edit`);
  revalidatePath(`/e/${event.slug}`);
  revalidatePath("/app/events");
  return { success: "Funciones actualizadas." };
}

export async function updateEvent(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = eventUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisá el nombre, lugar, horarios y capacidad." };

  const supabase = await createClient();
  const [{ data: event }, { data: venue }] = await Promise.all([
    supabase.from("events").select("slug, status, organization_id, starts_at, doors_open_at, venue_id").eq("id", parsed.data.eventId).single(),
    supabase.from("venues").select("timezone").eq("id", parsed.data.venueId).single(),
  ]);
  if (!event || !venue) return { error: "No encontramos el evento o el lugar." };
  if (["finished", "cancelled"].includes(event.status)) return { error: "Este evento ya no admite modificaciones." };

  const startsAt = zonedIso(parsed.data.startsAt, venue.timezone);
  const doorsOpenAt = parsed.data.doorsOpenAt ? zonedIso(parsed.data.doorsOpenAt, venue.timezone) : null;
  const endsAt = parsed.data.endsAt ? zonedIso(parsed.data.endsAt, venue.timezone) : null;
  if (!startsAt || (parsed.data.doorsOpenAt && !doorsOpenAt) || (parsed.data.endsAt && !endsAt)) return { error: "Alguno de los horarios no es válido." };
  if (new Date(startsAt).getTime() <= Date.now()) return { error: "La fecha del evento debe ser futura." };
  if (doorsOpenAt && new Date(doorsOpenAt) > new Date(startsAt)) return { error: "La apertura de puertas debe ser anterior al inicio." };
  if (endsAt && new Date(endsAt) <= new Date(startsAt)) return { error: "El cierre debe ser posterior al inicio." };

  const { error } = await supabase.rpc("update_event_details", {
    target_event: parsed.data.eventId,
    target_venue: parsed.data.venueId,
    target_name: parsed.data.name,
    target_description: parsed.data.description,
    target_starts_at: startsAt,
    target_doors_open_at: doorsOpenAt,
    target_ends_at: endsAt,
    target_capacity: parsed.data.capacity,
    target_require_document: parsed.data.requireDocument,
  });
  if (error) {
    console.error(JSON.stringify({ level: "error", event: "event.update.failed", eventId: parsed.data.eventId, code: error.code, detail: error.message }));
    return { error: eventMutationError(error.message) };
  }
  await supabase.from("events").update({ discovery_category: parsed.data.discoveryCategory }).eq("id", parsed.data.eventId);

  revalidatePath(`/app/events/${parsed.data.eventId}`);
  revalidatePath(`/e/${event.slug}`);
  revalidatePath("/app/events");
  revalidatePath("/app");
  revalidatePath("/");

  if (event.status === "published") {
    const changedFields: string[] = [];
    if (new Date(startsAt).getTime() !== new Date(event.starts_at).getTime()) changedFields.push("la fecha y hora");
    if (parsed.data.venueId !== event.venue_id) changedFields.push("el lugar");
    if (changedFields.length) {
      try { await notifyEventChange(parsed.data.eventId, changedFields); } catch { /* Best-effort; the edit itself already succeeded. */ }
    }
  }

  return { success: "Cambios guardados." };
}

export async function createTicketType(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = ticketTypeInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisá nombre, precio, cantidad y máximo por compra." };
  const supabase = await createClient();
  const { data: phases } = await supabase.from("sale_phases").select("sort_order").eq("event_id", parsed.data.eventId).order("sort_order", { ascending: false }).limit(1);
  const sortOrder = (phases?.[0]?.sort_order ?? -1) + 1;
  const { data: phase, error: phaseError } = await supabase.from("sale_phases").insert({
    organization_id: parsed.data.organizationId, event_id: parsed.data.eventId,
    name: parsed.data.phaseName, sort_order: sortOrder, activate_next_when_sold_out: true,
  }).select("id").single();
  if (phaseError || !phase) return { error: "No pudimos crear la preventa." };
  const { error } = await supabase.from("ticket_types").insert({
    organization_id: parsed.data.organizationId, event_id: parsed.data.eventId, name: parsed.data.name,
    sale_phase_id: phase.id,
    description: "", price_amount: pesosToMinorUnits(parsed.data.pricePesos), currency: "ARS",
    quantity: parsed.data.quantity, max_per_order: parsed.data.maxPerOrder, sales_start: null,
    sales_end: null, active: true, sort_order: sortOrder,
  });
  if (error) {
    await supabase.from("sale_phases").delete().eq("id", phase.id);
    return { error: "No pudimos crear el tipo de entrada." };
  }
  revalidatePath(`/app/events/${parsed.data.eventId}`);
  revalidatePath("/app/events/new");
  return {};
}

export async function updateTicketType(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = ticketTypeUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisá nombre, precio, cantidad y máximo por compra." };
  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("status").eq("id", parsed.data.eventId).eq("organization_id", parsed.data.organizationId).single();
  if (!event || event.status !== "draft") return { error: "Solo podés editar entradas mientras el evento está en borrador." };
  const { error } = await supabase.from("ticket_types").update({
    name: parsed.data.name,
    price_amount: pesosToMinorUnits(parsed.data.pricePesos),
    quantity: parsed.data.quantity,
    max_per_order: parsed.data.maxPerOrder,
  }).eq("id", parsed.data.ticketTypeId).eq("event_id", parsed.data.eventId).eq("organization_id", parsed.data.organizationId);
  if (error) return { error: "No pudimos guardar los cambios." };
  revalidatePath(`/app/events/${parsed.data.eventId}`);
  revalidatePath("/app/events/new");
  return {};
}

export async function deleteTicketType(formData: FormData) {
  const eventId = formData.get("eventId");
  const ticketTypeId = formData.get("ticketTypeId");
  const phaseId = formData.get("phaseId");
  if (typeof eventId !== "string" || typeof ticketTypeId !== "string") return;
  const supabase = await createClient();
  const { error } = await supabase.from("ticket_types").delete().eq("id", ticketTypeId).eq("event_id", eventId);
  if (!error && typeof phaseId === "string" && phaseId) await supabase.from("sale_phases").delete().eq("id", phaseId).eq("event_id", eventId);
  revalidatePath(`/app/events/${eventId}`);
  revalidatePath("/app/events/new");
}

export async function replaceEventCover(_: ActionState, formData: FormData): Promise<ActionState> {
  const eventId = formData.get("eventId");
  const organizationId = formData.get("organizationId");
  const cover = formData.get("cover");
  if (typeof eventId !== "string" || typeof organizationId !== "string" || !(cover instanceof File) || cover.size === 0) return { error: "Elegí una imagen." };
  const validationError = validateCover(cover);
  if (validationError) return { error: validationError };
  const supabase = await createClient();
  const extension = cover.type === "image/png" ? "png" : cover.type === "image/webp" ? "webp" : "jpg";
  const path = `${organizationId}/${eventId}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage.from("event-covers").upload(path, cover, { contentType: cover.type, cacheControl: "3600" });
  if (uploadError) return { error: "No pudimos subir el flyer." };
  const publicUrl = supabase.storage.from("event-covers").getPublicUrl(path).data.publicUrl;
  const { error } = await supabase.from("events").update({ cover_image_url: publicUrl }).eq("id", eventId).eq("organization_id", organizationId);
  if (error) {
    await supabase.storage.from("event-covers").remove([path]);
    return { error: "No pudimos guardar el nuevo flyer." };
  }
  revalidatePath(`/app/events/${eventId}`);
  revalidatePath("/app/events");
  revalidatePath("/app");
  return {};
}

export async function publishEvent(formData: FormData) {
  const eventId = formData.get("eventId");
  if (typeof eventId !== "string") return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("publish_event", { target_event: eventId });
  if (error) redirect(`/app/events/${eventId}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/app/events/${eventId}`);
  redirect(`/app/events/${eventId}?published=1`);
}

const duplicateEventSchema = z.object({
  eventId: z.uuid(),
  name: z.string().trim().min(2).max(140),
  startsAt: z.string().min(1),
  timezone: z.string().min(1).max(120),
});

export async function duplicateEvent(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = duplicateEventSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisá el nombre y la fecha de la copia." };
  let startsAt: string;
  try {
    startsAt = fromZonedTime(parsed.data.startsAt, parsed.data.timezone).toISOString();
  } catch {
    return { error: "La fecha no es válida." };
  }
  if (new Date(startsAt).getTime() <= Date.now()) return { error: "La nueva fecha debe ser futura." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("duplicate_event_with_options", {
    target_event: parsed.data.eventId,
    target_name: parsed.data.name,
    target_slug: `${slugify(parsed.data.name)}-${crypto.randomUUID().slice(0, 6)}`,
    target_starts_at: startsAt,
    preserve_tickets: formData.get("preserveTickets") === "on",
    preserve_promoters: formData.get("preservePromoters") === "on",
    preserve_tables: formData.get("preserveTables") === "on",
    preserve_products: formData.get("preserveProducts") === "on",
    preserve_sales_locations: formData.get("preserveSalesLocations") === "on",
  });
  if (error || !data) return { error: "No pudimos duplicar el evento." };
  revalidatePath("/app/events");
  redirect(`/app/events/${data}`);
}

function validateCover(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return "Usá una imagen JPG, PNG o WebP.";
  if (file.size > 5 * 1024 * 1024) return "El flyer puede pesar hasta 5 MB.";
  return null;
}

function zonedIso(value: string, timezone: string) {
  const date = fromZonedTime(value, timezone);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function eventMutationError(message?: string) {
  if (!message) return "No pudimos guardar el evento.";
  if (message.includes("VENUE_CAPACITY_EXCEEDED")) return "La capacidad supera la permitida por el lugar.";
  if (message.includes("CONFIGURED_CAPACITY_EXCEEDED")) return "La capacidad no puede ser menor que las entradas y mesas configuradas.";
  if (message.includes("DOORS_AFTER_START")) return "La apertura de puertas debe ser anterior al inicio.";
  if (message.includes("END_BEFORE_START")) return "El cierre debe ser posterior al inicio.";
  if (message.includes("EVENT_NOT_EDITABLE")) return "Este evento ya no admite modificaciones.";
  if (message.includes("NOT_ALLOWED") || message.includes("VENUE_NOT_ALLOWED")) return "No tenés permiso para modificar este evento.";
  return "No pudimos guardar el evento. Revisá los datos e intentá nuevamente.";
}
