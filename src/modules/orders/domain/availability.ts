export type Inventory = { capacity: number; eventHeld: number; typeQuantity: number; typeHeld: number; maxPerOrder: number };

export function canHold(requested: number, inventory: Inventory) {
  if (!Number.isInteger(requested) || requested < 1 || requested > inventory.maxPerOrder) return { ok: false as const, reason: "invalid_quantity" as const };
  if (inventory.typeHeld + requested > inventory.typeQuantity) return { ok: false as const, reason: "ticket_type_sold_out" as const };
  if (inventory.eventHeld + requested > inventory.capacity) return { ok: false as const, reason: "event_sold_out" as const };
  return { ok: true as const };
}

export function calculateBuyerPaidFee(subtotal: number, basisPoints: number) {
  if (!Number.isSafeInteger(subtotal) || subtotal < 0 || !Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10000) throw new Error("Invalid fee input");
  return Math.round((subtotal * basisPoints) / 10000);
}
