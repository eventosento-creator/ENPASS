import { z } from "zod";

export const BOX_OFFICE_PAYMENT_METHODS = ["cash", "qr", "debit_card", "credit_card", "bank_transfer", "other"] as const;
export type BoxOfficePaymentMethod = (typeof BOX_OFFICE_PAYMENT_METHODS)[number];

export const boxOfficeMethodLabels: Record<BoxOfficePaymentMethod, string> = {
  cash: "Efectivo",
  qr: "QR",
  debit_card: "Débito",
  credit_card: "Crédito",
  bank_transfer: "Transferencia",
  other: "Otro",
};

// Manual methods issue the ticket immediately as "already collected": the label says so to avoid confusing them
// with "Pagar online (QR)", which is the one that sends the buyer to pay.
export const boxOfficeChipLabels: Record<BoxOfficePaymentMethod, string> = {
  cash: "Efectivo",
  qr: "QR externo (ya cobrado)",
  debit_card: "Débito (ya cobrado)",
  credit_card: "Crédito (ya cobrado)",
  bank_transfer: "Transferencia (ya recibida)",
  other: "Otro (ya cobrado)",
};

export type BoxOfficeConfig = {
  enabled: boolean;
  cash_enabled: boolean;
  qr_enabled: boolean;
  debit_enabled: boolean;
  credit_enabled: boolean;
  transfer_enabled: boolean;
  other_enabled: boolean;
  cashier_user_id: string | null;
};

export type BoxOfficeTicketType = {
  ticket_type_id: string;
  name: string;
  description: string;
  currency: string;
  unit_price_amount: number;
  online_price_amount: number;
  available_quantity: number;
  max_per_order: number;
  sale_open: boolean;
};

export type BoxOfficeQuote = { unit_price_amount: number; subtotal_amount: number; service_fee_amount: number; total_amount: number; currency: string };

export function enabledBoxOfficeMethods(config: BoxOfficeConfig): BoxOfficePaymentMethod[] {
  const flags: Record<BoxOfficePaymentMethod, boolean> = {
    cash: config.cash_enabled, qr: config.qr_enabled, debit_card: config.debit_enabled,
    credit_card: config.credit_enabled, bank_transfer: config.transfer_enabled, other: config.other_enabled,
  };
  return BOX_OFFICE_PAYMENT_METHODS.filter((method) => flags[method]);
}

export const boxOfficeQuoteSchema = z.object({
  ticketTypeId: z.uuid(),
  quantity: z.number().int().min(1).max(99),
});

const requiredDocument = z.string().trim().max(30)
  .transform((value) => value.replace(/[.\s-]/g, ""))
  .refine((value) => /^\d{7,8}$/.test(value), { message: "DNI inválido" });

export const boxOfficeSaleSchema = boxOfficeQuoteSchema.extend({
  idempotencyKey: z.uuid(),
  buyerFirstName: z.string().trim().min(1).max(80),
  buyerLastName: z.string().trim().min(1).max(80),
  buyerDocument: requiredDocument,
  buyerEmail: z.email(),
  buyerPhone: z.string().trim().max(40).default(""),
});

export const boxOfficeConfirmSchema = z.object({
  orderPublicId: z.string().regex(/^[0-9a-f]{32}$/),
  paymentMethod: z.enum(BOX_OFFICE_PAYMENT_METHODS),
  cashReceivedAmount: z.number().int().nonnegative().nullable().optional(),
  externalReference: z.string().trim().max(160).nullable().optional(),
});
