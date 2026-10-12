import { z } from "zod";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import type { PromotionKind, PromotionStatus } from "@/shared/database/types";

// Las fechas del panel se cargan en hora de Argentina (sin horario de verano).
export const PROMOTION_TIMEZONE = "America/Argentina/Mendoza";

export const promotionKinds: Array<{ value: PromotionKind; label: string; hint: string }> = [
  { value: "percent", label: "Porcentaje", hint: "Ej.: 20% menos en cada entrada." },
  { value: "fixed", label: "Monto fijo", hint: "Ej.: $5.000 menos en cada entrada beneficiada." },
  { value: "free", label: "100% (cortesía)", hint: "Entradas gratis. Se emiten como cortesía, con su costo de emisión." },
  { value: "two_for_one", label: "2×1", hint: "De cada 2 entradas, la más barata es gratis." },
  { value: "special_price", label: "Precio especial", hint: "Las entradas elegidas salen a un precio fijo, sin cambiar el precio público." },
];

export const promotionStatusLabels: Record<PromotionStatus, string> = {
  active: "Activo", inactive: "Desactivado", expired: "Vencido", scheduled: "Programado", exhausted: "Agotado",
};

export const redemptionStatusLabels: Record<string, string> = {
  reserved: "Reservado", confirmed: "Confirmado", released: "Liberado", refunded: "Reembolsado",
};

type MoneyFormatter = (centavos: number) => string;

export function describeDiscount(promotion: { kind: PromotionKind; percent_bps: number | null; fixed_amount: number | null; special_price_amount: number | null; max_tickets_benefited: number | null }, money: MoneyFormatter) {
  switch (promotion.kind) {
    case "percent": return `${(promotion.percent_bps ?? 0) / 100}%`;
    case "fixed": return `${money(promotion.fixed_amount ?? 0)} por entrada`;
    case "free": return `100% · hasta ${promotion.max_tickets_benefited ?? 1} ${promotion.max_tickets_benefited === 1 ? "entrada" : "entradas"}`;
    case "two_for_one": return "2×1";
    case "special_price": return `Precio ${money(promotion.special_price_amount ?? 0)}`;
  }
}

const errorMessages: Record<string, string> = {
  CODE_NOT_FOUND: "Ese código no existe. Revisá que esté bien escrito.",
  CODE_INACTIVE: "Este código está desactivado.",
  CODE_NOT_STARTED: "Este código todavía no está disponible.",
  CODE_EXPIRED: "Este código venció.",
  CODE_WRONG_EVENT: "Este código no es válido para este evento.",
  CODE_NOT_APPLICABLE: "Este código no aplica a las entradas que elegiste.",
  CODE_EXHAUSTED: "Este código ya se agotó.",
  CODE_BUYER_LIMIT: "Ya usaste este código el máximo de veces permitido.",
  CODE_FREE_ONLY_ELIGIBLE: "Este código es solo para las entradas que incluye. Sacá las demás de tu compra para usarlo.",
  CODE_NO_DISCOUNT: "Este código no genera descuento en tu compra.",
  RATE_LIMITED: "Probaste muchos códigos. Esperá unos minutos y volvé a intentar.",
};

/** Mensaje amable para el comprador según el código de error del motor. */
export function promotionErrorMessage(code: string | null | undefined, detail: { min?: number; max?: number } = {}) {
  if (code === "CODE_MIN_TICKETS") return `Este código se aplica comprando al menos ${detail.min ?? 2} entradas.`;
  if (code === "CODE_FREE_LIMIT") return `Este código cubre hasta ${detail.max ?? 1} ${detail.max === 1 ? "entrada" : "entradas"} por compra.`;
  return (code && errorMessages[code]) || "No pudimos validar el código. Probá de nuevo.";
}

/** Si el mensaje de error de la base trae un código de promoción, lo devuelve. */
export function promotionCodeFromError(message: string | undefined | null) {
  return message?.match(/\bCODE_[A-Z_]+\b/)?.[0] ?? null;
}

export type PromotionPreview = {
  valid: boolean; error?: string; min?: number; max?: number; code?: string; name?: string; kind?: PromotionKind;
  courtesy?: boolean; discount_amount?: number; tickets_benefited?: number; list_ticket_subtotal?: number;
};

/**
 * Totales del checkout. El descuento viene de la base; el cargo de servicio se calcula sobre el precio BASE y no cambia
 * (salvo cortesía, donde no se cobra y rige el costo de emisión de cortesía). Debe dar lo mismo que la orden real.
 */
export function checkoutTotals({ listSubtotal, serviceFee, preview }: { listSubtotal: number; serviceFee: number; preview: PromotionPreview | null }) {
  const discount = preview?.valid ? Math.min(preview.discount_amount ?? 0, listSubtotal) : 0;
  const courtesy = Boolean(preview?.valid && preview.courtesy);
  const fee = courtesy ? 0 : serviceFee;
  const subtotal = listSubtotal - discount;
  return { discount, courtesy, serviceFee: fee, subtotal, total: subtotal + fee };
}

// ---- Formulario del productor ----

const optionalInt = z.preprocess((value) => (value === "" || value == null ? undefined : value), z.coerce.number().int().min(1).max(1_000_000).optional());
const optionalPesos = z.preprocess((value) => (value === "" || value == null ? undefined : value), z.coerce.number().min(0.01).max(100_000_000).optional());

export const promotionFormSchema = z.object({
  organizationId: z.string().uuid(),
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Poné un nombre interno.").max(80),
  code: z.string().trim().min(3, "El código necesita al menos 3 caracteres.").max(30),
  description: z.string().trim().max(300).optional(),
  kind: z.enum(["percent", "fixed", "free", "two_for_one", "special_price"]),
  percent: z.preprocess((value) => (value === "" || value == null ? undefined : value), z.coerce.number().gt(0).lt(100).optional()),
  fixedPesos: optionalPesos,
  specialPesos: optionalPesos,
  active: z.string().optional(),
  allEvents: z.string().optional(),
  eventIds: z.array(z.string().uuid()).default([]),
  ticketTypeIds: z.array(z.string().uuid()).default([]),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  maxTotalUses: optionalInt,
  maxUsesPerBuyer: optionalInt,
  maxTicketsBenefited: optionalInt,
  minTickets: optionalInt,
  maxDiscountPesos: optionalPesos,
});

export type PromotionFormInput = z.infer<typeof promotionFormSchema>;

export function toCentavos(pesos: number | undefined) {
  return pesos === undefined ? null : Math.round(pesos * 100);
}

/** "2026-12-20T23:00" (hora de Argentina) → ISO UTC. */
export function localToIso(value: string | undefined) {
  return value ? fromZonedTime(value, PROMOTION_TIMEZONE).toISOString() : null;
}

/** ISO UTC → valor para un input datetime-local en hora de Argentina. */
export function isoToLocalInput(value: string | null | undefined) {
  if (!value) return "";
  const zoned = toZonedTime(new Date(value), PROMOTION_TIMEZONE);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${zoned.getFullYear()}-${pad(zoned.getMonth() + 1)}-${pad(zoned.getDate())}T${pad(zoned.getHours())}:${pad(zoned.getMinutes())}`;
}

export function promotionRpcError(message: string | undefined | null) {
  const code = message?.match(/\b[A-Z_]{5,}\b/)?.[0];
  switch (code) {
    case "CODE_TAKEN": return "Ya tenés un cupón con ese código. Elegí otro.";
    case "CODE_LOCKED": return "Este código ya se usó en compras: no se puede cambiar. Podés duplicar la promoción con otro código.";
    case "INVALID_CODE": return "El código solo puede tener letras, números, guion y guion bajo (3 a 30 caracteres).";
    case "EVENT_REQUIRED": return "Elegí al menos un evento o marcá \"todos mis eventos\".";
    case "EVENT_NOT_ALLOWED": return "Ese evento no es de tu organización.";
    case "TICKET_TYPE_NOT_ALLOWED": return "Alguna de las entradas elegidas no pertenece a los eventos de la promoción.";
    case "INVALID_PROMOTION": return "Revisá los valores: falta algo o no es válido (por ejemplo, el 100% pide un máximo de entradas).";
    case "NOT_ALLOWED": return "No tenés permiso para hacer esto.";
    default: return "No pudimos guardar la promoción. Probá de nuevo.";
  }
}

// ---- CSV ----

export function csvCell(value: string | number | null | undefined) {
  const text = value == null ? "" : String(value);
  // Neutraliza fórmulas de planilla (=, +, -, @) para que un dato cargado por un comprador no se ejecute al abrir el archivo.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>) {
  return "﻿" + [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
