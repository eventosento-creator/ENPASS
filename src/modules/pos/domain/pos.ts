import { z } from "zod";
import type { EventProfile } from "@/modules/events/domain/event-profile";

export const POS_SESSION_COOKIE = "enpass_pos_session";
export const POS_PAYMENT_METHODS = ["cash", "card", "mercado_pago", "bank_transfer"] as const;
export type PosPaymentMethod = (typeof POS_PAYMENT_METHODS)[number];

export type PosCatalogItem = {
  event_product_id: string;
  product_id: string;
  product_name: string;
  product_description: string;
  category_id: string | null;
  category_name: string | null;
  sku: string | null;
  barcode: string | null;
  price_amount: number;
  currency: string;
  sort_order: number;
};

export type PosCartLine = PosCatalogItem & { quantity: number };

export type PosDeviceSessionView = {
  device_session_id: string;
  device_id: string;
  event_id: string;
  event_name: string;
  sales_location_id: string;
  sales_location_name: string;
  device_name: string;
  event_timezone: string;
  expires_at: string;
  pos_enabled: boolean;
  event_status: "draft" | "published" | "sold_out" | "finished" | "cancelled";
  cash_session_id: string | null;
  cash_session_status: "open" | "closed" | null;
  operator_label: string | null;
  opening_cash_amount: number | null;
  opened_at: string | null;
};

export const posActivationSchema = z.object({ pin: z.string().regex(/^\d{6}$/) });
export const openPosSessionSchema = z.object({
  openingCashAmount: z.number().int().nonnegative().max(9_000_000_000_000),
  operatorLabel: z.string().trim().max(80).default(""),
});
export const posSaleSchema = z.object({
  idempotencyKey: z.uuid(),
  items: z.array(z.object({ event_product_id: z.uuid(), quantity: z.number().int().min(1).max(99) })).min(1).max(60),
  paymentMethod: z.enum(POS_PAYMENT_METHODS),
  cashReceivedAmount: z.number().int().nonnegative().nullable().optional(),
  externalReference: z.string().trim().max(160).nullable().optional(),
});
export const posMovementSchema = z.object({
  type: z.enum(["cash_in", "cash_out"]),
  amount: z.number().int().positive().max(9_000_000_000_000),
  reason: z.string().trim().min(2).max(240),
});
export const closePosSessionSchema = z.object({
  countedCashAmount: z.number().int().nonnegative().max(9_000_000_000_000),
});

export function addCartItem(cart: PosCartLine[], item: PosCatalogItem): PosCartLine[] {
  const existing = cart.find((line) => line.event_product_id === item.event_product_id);
  if (!existing) return [...cart, { ...item, quantity: 1 }];
  return cart.map((line) => line.event_product_id === item.event_product_id
    ? { ...line, quantity: Math.min(99, line.quantity + 1) }
    : line);
}

export function setCartQuantity(cart: PosCartLine[], eventProductId: string, quantity: number): PosCartLine[] {
  if (quantity <= 0) return cart.filter((line) => line.event_product_id !== eventProductId);
  return cart.map((line) => line.event_product_id === eventProductId
    ? { ...line, quantity: Math.min(99, Math.trunc(quantity)) }
    : line);
}

export function calculateCartTotal(cart: Array<Pick<PosCartLine, "price_amount" | "quantity">>) {
  return cart.reduce((total, line) => total + line.price_amount * line.quantity, 0);
}

export function calculateCashSettlement(total: number, received: number) {
  if (!Number.isInteger(total) || !Number.isInteger(received) || total < 0 || received < total) {
    throw new Error("INSUFFICIENT_CASH");
  }
  return { received, change: received - total };
}

export function calculateExpectedCash(input: {
  opening: number; cashSales: number; cashIn: number; cashOut: number; cashRefunds: number;
}) {
  return input.opening + input.cashSales + input.cashIn - input.cashOut - input.cashRefunds;
}

export function getPosModuleLabel(profile: EventProfile) {
  if (profile === "nightlife") return "Caja";
  if (profile === "expo") return "Punto de venta";
  return "Ventas";
}

export const paymentMethodLabels: Record<PosPaymentMethod, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  mercado_pago: "Mercado Pago",
  bank_transfer: "Transferencia",
};
