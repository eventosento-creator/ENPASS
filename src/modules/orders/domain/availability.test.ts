import { describe, expect, it } from "vitest";
import { calculateBuyerPaidFee, canHold } from "./availability";

describe("canHold", () => {
  const inventory = { capacity: 600, eventHeld: 590, typeQuantity: 100, typeHeld: 90, maxPerOrder: 6 };
  it("accepts inventory available under both limits", () => expect(canHold(6, inventory)).toEqual({ ok: true }));
  it("rejects quantities above max per order", () => expect(canHold(7, inventory)).toEqual({ ok: false, reason: "invalid_quantity" }));
  it("rejects a sold-out ticket type even with event capacity", () => expect(canHold(6, { ...inventory, typeHeld: 95, eventHeld: 0 })).toEqual({ ok: false, reason: "ticket_type_sold_out" }));
  it("rejects event overselling even with ticket type capacity", () => expect(canHold(6, { ...inventory, eventHeld: 595, typeHeld: 0 })).toEqual({ ok: false, reason: "event_sold_out" }));
});

describe("calculateBuyerPaidFee", () => {
  it("uses integer minor units and basis points", () => expect(calculateBuyerPaidFee(1_000_000, 800)).toBe(80_000));
  it("rounds to the nearest minor unit", () => expect(calculateBuyerPaidFee(101, 250)).toBe(3));
  it("rejects unsafe inputs", () => expect(() => calculateBuyerPaidFee(-1, 800)).toThrow());
});
