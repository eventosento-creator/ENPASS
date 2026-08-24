import { describe, expect, it } from "vitest";
import { eventUpdateSchema, pesosToMinorUnits, ticketTypeInputSchema } from "./event";

describe("ticket type money", () => {
  it("converts ARS to minor units without floats in persistence", () => expect(pesosToMinorUnits(10_000)).toBe(1_000_000));
  it("rejects fractional peso input in the initial product", () => expect(ticketTypeInputSchema.safeParse({ eventId: crypto.randomUUID(), organizationId: crypto.randomUUID(), name: "General", phaseName: "General", pricePesos: 10.5, quantity: 1, maxPerOrder: 6 }).success).toBe(false));
});

describe("event updates", () => {
  const valid = {
    eventId: crypto.randomUUID(), venueId: crypto.randomUUID(), name: "Neon Ritual",
    description: "Una noche distinta", startsAt: "2026-09-20T23:00", doorsOpenAt: "2026-09-20T22:00",
    endsAt: "2026-09-21T06:00", capacity: "500", requireDocument: "true",
  };

  it("accepts local event times and coerces form values", () => {
    const parsed = eventUpdateSchema.parse(valid);
    expect(parsed.capacity).toBe(500);
    expect(parsed.requireDocument).toBe(true);
  });

  it("accepts optional access and end times", () => {
    const parsed = eventUpdateSchema.parse({ ...valid, doorsOpenAt: "", endsAt: "" });
    expect(parsed.doorsOpenAt).toBeUndefined();
    expect(parsed.endsAt).toBeUndefined();
  });
});
