import { describe, expect, it } from "vitest";
import { eventUpdateSchema, pesosToMinorUnits, ticketTypeInputSchema } from "./event";

describe("ticket type money", () => {
  it("converts ARS to minor units without floats in persistence", () => expect(pesosToMinorUnits(10_000)).toBe(1_000_000));
  it("rejects fractional peso input in the initial product", () => expect(ticketTypeInputSchema.safeParse({ eventId: crypto.randomUUID(), organizationId: crypto.randomUUID(), name: "General", phaseName: "General", pricePesos: 10.5, quantity: 1, maxPerOrder: 6 }).success).toBe(false));
});

describe("ticket type entry cutoff", () => {
  const base = { eventId: crypto.randomUUID(), organizationId: crypto.randomUUID(), name: "Gratis", phaseName: "Gratis", pricePesos: 0, quantity: 10, maxPerOrder: 4 };
  it("is optional: empty means no cutoff", () => {
    expect(ticketTypeInputSchema.parse({ ...base, entryCutoff: "" }).entryCutoff).toBeUndefined();
    expect(ticketTypeInputSchema.parse(base).entryCutoff).toBeUndefined();
  });
  it("accepts HH:MM, including after midnight", () => {
    expect(ticketTypeInputSchema.parse({ ...base, entryCutoff: "01:00" }).entryCutoff).toBe("01:00");
    expect(ticketTypeInputSchema.parse({ ...base, entryCutoff: "23:59" }).entryCutoff).toBe("23:59");
  });
  it("rejects malformed times", () => {
    for (const entryCutoff of ["25:00", "1:00", "02:60", "abc"]) expect(ticketTypeInputSchema.safeParse({ ...base, entryCutoff }).success).toBe(false);
  });
});

describe("event updates", () => {
  const valid = {
    eventId: crypto.randomUUID(), venueId: crypto.randomUUID(), name: "Neon Ritual",
    discoveryCategory: "party", description: "Una noche distinta", startsAt: "2026-09-20T23:00", doorsOpenAt: "2026-09-20T22:00",
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
