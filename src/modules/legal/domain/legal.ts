import { z } from "zod";

export const startArrepentimientoSchema = z.object({
  orderPublicId: z.string().trim().regex(/^[0-9a-f]{32}$/),
  email: z.email(),
});

export const confirmArrepentimientoSchema = z.object({
  token: z.string().trim().min(20).max(100),
});
