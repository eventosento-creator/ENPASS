import { z } from "zod";

export const tableBenefitInputSchema = z.object({
  type: z.enum(["product", "drink", "generic"]),
  name: z.string().trim().min(1).max(100),
  quantity: z.number().int().positive().max(1_000),
});

export const tableZoneInputSchema = z.object({
  eventId: z.uuid(),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(280).default(""),
});

export const eventTableInputSchema = z.object({
  eventId: z.uuid(),
  zoneId: z.uuid(),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(280).default(""),
  capacity: z.coerce.number().int().min(1).max(1_000),
  pricePesos: z.coerce.number().nonnegative().max(100_000_000),
  serviceFeePercent: z.union([z.literal(""), z.coerce.number().min(0).max(100)]).default(""),
  accessGateId: z.union([z.literal(""), z.uuid()]).default(""),
  benefits: z.string().transform((value, ctx) => {
    try {
      return z.array(tableBenefitInputSchema).max(30).parse(JSON.parse(value));
    } catch {
      ctx.addIssue({ code: "custom", message: "Beneficios inválidos" });
      return z.NEVER;
    }
  }),
});

export function pesosToMinorUnits(value: number) {
  return Math.round(value * 100);
}

export function percentToBasisPoints(value: number | "") {
  return value === "" ? null : Math.round(value * 100);
}

export function tableAvailabilityLabel(status: "available" | "held" | "sold", active = true) {
  if (!active) return "Deshabilitada";
  if (status === "sold") return "Vendida";
  if (status === "held") return "Reservada temporalmente";
  return "Disponible";
}
