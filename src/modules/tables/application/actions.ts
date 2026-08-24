"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/shared/database/server";
import type { ActionState } from "@/modules/identity/application/actions";
import { eventTableInputSchema, percentToBasisPoints, pesosToMinorUnits, tableZoneInputSchema } from "../domain/table";

export async function createTableZone(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = tableZoneInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisá el nombre del sector." };
  const { error } = await (await createClient()).rpc("create_table_zone", {
    target_event: parsed.data.eventId,
    target_name: parsed.data.name,
    target_description: parsed.data.description,
  });
  if (error) return { error: "No pudimos crear el sector. Revisá que el nombre no esté repetido." };
  revalidatePath(`/app/events/${parsed.data.eventId}/tables`);
  return {};
}

export async function createEventTable(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = eventTableInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisá sector, nombre, personas, precio y beneficios." };
  const { error } = await (await createClient()).rpc("create_event_table", {
    target_event: parsed.data.eventId,
    target_zone: parsed.data.zoneId,
    target_name: parsed.data.name,
    target_description: parsed.data.description,
    target_capacity: parsed.data.capacity,
    target_base_price_amount: pesosToMinorUnits(parsed.data.pricePesos),
    target_currency: "ARS",
    target_service_fee_bps: percentToBasisPoints(parsed.data.serviceFeePercent),
    target_access_gate: parsed.data.accessGateId || null,
    target_benefits: parsed.data.benefits.map((benefit) => ({
      entitlement_type: benefit.type,
      name: benefit.name,
      quantity: benefit.quantity,
    })),
  });
  if (error) {
    if (error.message.includes("EVENT_CAPACITY_EXCEEDED")) return { error: "La capacidad combinada de entradas y mesas supera la del evento." };
    return { error: "No pudimos crear la mesa. Revisá que el nombre sea único dentro del sector." };
  }
  revalidatePath(`/app/events/${parsed.data.eventId}/tables`);
  revalidatePath(`/e/`);
  return {};
}

export async function setEventTableActive(formData: FormData) {
  const eventId = formData.get("eventId");
  const tableId = formData.get("tableId");
  const active = formData.get("active") === "true";
  if (typeof eventId !== "string" || typeof tableId !== "string") return;
  await (await createClient()).rpc("set_event_table_active", { target_table: tableId, target_active: active });
  revalidatePath(`/app/events/${eventId}/tables`);
}
