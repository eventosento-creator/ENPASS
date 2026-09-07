import { z } from "zod";

export const seatMapSectionInputSchema = z.object({
  eventId: z.uuid(),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(280).default(""),
  rows: z.coerce.number().int().min(1).max(26),
  seatsPerRow: z.coerce.number().int().min(1).max(60),
  pricePesos: z.coerce.number().nonnegative().max(100_000_000),
  serviceFeePercent: z.union([z.literal(""), z.coerce.number().min(0).max(100)]).default(""),
});

export function pesosToMinorUnits(value: number) {
  return Math.round(value * 100);
}

export function percentToBasisPoints(value: number | "") {
  return value === "" ? null : Math.round(value * 100);
}

export function seatAvailabilityLabel(status: "available" | "held" | "sold", active = true) {
  if (!active) return "Deshabilitado";
  if (status === "sold") return "Vendido";
  if (status === "held") return "Reservado temporalmente";
  return "Disponible";
}
