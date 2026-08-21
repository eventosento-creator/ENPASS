import { describe, expect, it } from "vitest";
import { pesosToMinorUnits, ticketTypeInputSchema } from "./event";

describe("ticket type money", () => {
  it("converts ARS to minor units without floats in persistence", () => expect(pesosToMinorUnits(10_000)).toBe(1_000_000));
  it("rejects fractional peso input in the initial product", () => expect(ticketTypeInputSchema.safeParse({ eventId: crypto.randomUUID(), organizationId: crypto.randomUUID(), name: "General", phaseName: "General", pricePesos: 10.5, quantity: 1, maxPerOrder: 6 }).success).toBe(false));
});
