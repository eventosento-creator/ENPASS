"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/shared/database/server";
import type { ActionState } from "@/modules/identity/application/actions";
import { percentToBasisPoints, pesosToMinorUnits, seatMapSectionInputSchema, seatMapSectionUpdateInputSchema } from "../domain/seat-map";

export async function createSeatMapSection(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = seatMapSectionInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisá el nombre, las filas, los asientos por fila y el precio." };
  const { error } = await (await createClient()).rpc("create_seat_map_section", {
    target_event: parsed.data.eventId,
    target_name: parsed.data.name,
    target_description: parsed.data.description,
    target_rows: parsed.data.rows,
    target_seats_per_row: parsed.data.seatsPerRow,
    target_base_price_amount: pesosToMinorUnits(parsed.data.pricePesos),
    target_currency: "ARS",
    target_service_fee_bps: percentToBasisPoints(parsed.data.serviceFeePercent),
  });
  if (error) {
    if (error.message.includes("EVENT_CAPACITY_EXCEEDED")) return { error: "La capacidad combinada de entradas, mesas y asientos supera la del evento." };
    return { error: "No pudimos crear la sección. Revisá que el nombre no esté repetido." };
  }
  revalidatePath(`/app/events/${parsed.data.eventId}/seatmap`);
  revalidatePath(`/e/`);
  return {};
}

export async function updateSeatMapSection(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = seatMapSectionUpdateInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisá el nombre y el precio." };
  const { error } = await (await createClient()).rpc("update_seat_map_section", {
    target_section: parsed.data.sectionId,
    target_name: parsed.data.name,
    target_description: parsed.data.description,
    target_base_price_amount: pesosToMinorUnits(parsed.data.pricePesos),
    target_service_fee_bps: percentToBasisPoints(parsed.data.serviceFeePercent),
  });
  if (error) {
    if (error.message.includes("DUPLICATE_SEAT_MAP_SECTION_NAME")) return { error: "Ya existe una sección con ese nombre." };
    return { error: "No pudimos guardar los cambios." };
  }
  revalidatePath(`/app/events/${parsed.data.eventId}/seatmap`);
  revalidatePath(`/e/`);
  return {};
}

export async function deleteSeatMapSection(formData: FormData) {
  const eventId = formData.get("eventId");
  const sectionId = formData.get("sectionId");
  if (typeof eventId !== "string" || typeof sectionId !== "string") return;
  await (await createClient()).rpc("delete_seat_map_section", { target_section: sectionId });
  revalidatePath(`/app/events/${eventId}/seatmap`);
  revalidatePath(`/e/`);
}

export async function setEventSeatActive(formData: FormData) {
  const eventId = formData.get("eventId");
  const seatId = formData.get("seatId");
  const active = formData.get("active") === "true";
  if (typeof eventId !== "string" || typeof seatId !== "string") return;
  await (await createClient()).rpc("set_event_seat_active", { target_seat: seatId, target_active: active });
  revalidatePath(`/app/events/${eventId}/seatmap`);
}
