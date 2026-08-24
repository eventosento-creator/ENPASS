"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/shared/database/server";

export type AccessActionState = { error?: string; success?: string; pin?: string };

const gateSchema = z.object({
  eventId: z.uuid(),
  gateId: z.uuid().optional(),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(240),
  active: z.enum(["true", "false"]).optional(),
  ticketTypeIds: z.array(z.uuid()).min(1),
});

const deviceSchema = z.object({
  eventId: z.uuid(),
  gateId: z.uuid(),
  label: z.string().trim().min(2).max(80),
  permission: z.enum(["scanner", "supervisor"]),
});

function parseGateForm(formData: FormData) {
  return gateSchema.safeParse({
    eventId: formData.get("eventId"),
    gateId: formData.get("gateId") || undefined,
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    active: formData.get("active") ? "true" : "false",
    ticketTypeIds: formData.getAll("ticketTypeIds"),
  });
}

export async function createAccessGate(_: AccessActionState, formData: FormData): Promise<AccessActionState> {
  const parsed = parseGateForm(formData);
  if (!parsed.success) return { error: "Definí un nombre y al menos un tipo de entrada." };
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return { error: "Tu sesión venció." };
  const { error } = await supabase.rpc("create_access_gate", {
    target_event: parsed.data.eventId,
    gate_name: parsed.data.name,
    gate_description: parsed.data.description,
    accepted_ticket_types: parsed.data.ticketTypeIds,
  });
  if (error) return { error: error.message.includes("duplicate") ? "Ya existe una puerta con ese nombre." : "No pudimos crear la puerta." };
  revalidatePath(`/app/events/${parsed.data.eventId}/access`);
  return { success: "Puerta creada." };
}

export async function updateAccessGate(_: AccessActionState, formData: FormData): Promise<AccessActionState> {
  const parsed = parseGateForm(formData);
  if (!parsed.success || !parsed.data.gateId) return { error: "Revisá la configuración de la puerta." };
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return { error: "Tu sesión venció." };
  const { error } = await supabase.rpc("update_access_gate", {
    target_gate: parsed.data.gateId,
    gate_name: parsed.data.name,
    gate_description: parsed.data.description,
    gate_active: parsed.data.active === "true",
    accepted_ticket_types: parsed.data.ticketTypeIds,
  });
  if (error) return { error: "No pudimos actualizar la puerta." };
  revalidatePath(`/app/events/${parsed.data.eventId}/access`);
  return { success: "Puerta actualizada." };
}

export async function createScannerAuthorization(_: AccessActionState, formData: FormData): Promise<AccessActionState> {
  const parsed = deviceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Elegí una puerta, un nombre y el nivel de permiso." };
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return { error: "Tu sesión venció." };
  const { data: event } = await supabase.from("events").select("starts_at, ends_at, status").eq("id", parsed.data.eventId).single();
  if (!event || !["published", "sold_out"].includes(event.status)) return { error: "El evento debe estar publicado." };
  const operationalEnd = event.ends_at
    ? new Date(new Date(event.ends_at).getTime() + 4 * 60 * 60 * 1000)
    : new Date(new Date(event.starts_at).getTime() + 16 * 60 * 60 * 1000);
  if (operationalEnd <= new Date()) return { error: "La ventana operativa del evento ya terminó." };
  const codeExpires = new Date(Math.min(Date.now() + 30 * 60 * 1000, operationalEnd.getTime()));

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const pin = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const { error } = await supabase.rpc("create_scanner_authorization", {
      target_event: parsed.data.eventId,
      target_gate: parsed.data.gateId,
      device_label: parsed.data.label,
      target_permission: parsed.data.permission,
      target_pin: pin,
      target_code_expires_at: codeExpires.toISOString(),
      target_session_expires_at: operationalEnd.toISOString(),
    });
    if (!error) {
      revalidatePath(`/app/events/${parsed.data.eventId}/access`);
      return { success: "Autorización creada. Copiá el PIN ahora: no volverá a mostrarse.", pin };
    }
    if (!error.message.includes("PIN_COLLISION")) return { error: "No pudimos crear la autorización." };
  }
  return { error: "No pudimos generar un PIN único. Intentá nuevamente." };
}

export async function revokeScannerAuthorization(formData: FormData) {
  const eventId = formData.get("eventId");
  const authorizationId = formData.get("authorizationId");
  if (typeof eventId !== "string" || typeof authorizationId !== "string") return;
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return;
  await supabase.rpc("revoke_scanner_authorization", { target_authorization: authorizationId });
  revalidatePath(`/app/events/${eventId}/access`);
}

export async function revokeScannerSession(formData: FormData) {
  const eventId = formData.get("eventId");
  const sessionId = formData.get("sessionId");
  if (typeof eventId !== "string" || typeof sessionId !== "string") return;
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return;
  await supabase.rpc("revoke_scanner_session", { target_session: sessionId });
  revalidatePath(`/app/events/${eventId}/access`);
}
