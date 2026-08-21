import { z } from "zod";

export const checkoutSchema = z.object({
  eventId: z.uuid(), firstName: z.string().trim().min(1).max(80), lastName: z.string().trim().min(1).max(80),
  email: z.email(), phone: z.string().trim().max(40).default(""), document: z.string().trim().max(30).default(""),
  selections: z.string().transform((value, ctx) => {
    try { return z.array(z.object({ ticket_type_id: z.uuid(), quantity: z.number().int().positive().max(20) })).min(1).parse(JSON.parse(value)); }
    catch { ctx.addIssue({ code: "custom", message: "Selección inválida" }); return z.NEVER; }
  }),
});
