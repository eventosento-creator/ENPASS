import { z } from "zod";

export const checkoutSelectionSchema = z.object({
  item_type: z.enum(["ticket", "table"]),
  item_id: z.uuid(),
  quantity: z.number().int().positive().max(20),
}).refine((selection) => selection.item_type !== "table" || selection.quantity === 1, { message: "Cada mesa se reserva una sola vez" });

export const checkoutSchema = z.object({
  eventId: z.uuid(), firstName: z.string().trim().min(1).max(80), lastName: z.string().trim().min(1).max(80),
  email: z.email(), phone: z.string().trim().max(40).default(""), document: z.string().trim().max(30).default(""),
  selections: z.string().transform((value, ctx) => {
    try { return z.array(checkoutSelectionSchema).min(1).max(20).parse(JSON.parse(value)); }
    catch { ctx.addIssue({ code: "custom", message: "Selección inválida" }); return z.NEVER; }
  }),
});
