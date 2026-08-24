import { describe, expect, it } from "vitest";
import { eventTableInputSchema, percentToBasisPoints, tableAvailabilityLabel } from "./table";

describe("table domain", () => {
  it("normalizes a real table definition", () => {
    const parsed = eventTableInputSchema.parse({
      eventId: "44444444-4444-4444-8444-444444444444",
      zoneId: "55555555-5555-4555-8555-555555555555",
      name: "Mesa VIP 08",
      description: "Vista a cabina",
      capacity: "8",
      pricePesos: "240000",
      serviceFeePercent: "5",
      accessGateId: "",
      benefits: JSON.stringify([{ type: "drink", name: "Botellas", quantity: 2 }]),
    });
    expect(parsed.capacity).toBe(8);
    expect(parsed.benefits).toEqual([{ type: "drink", name: "Botellas", quantity: 2 }]);
    expect(percentToBasisPoints(parsed.serviceFeePercent)).toBe(500);
  });

  it("rejects empty benefits and invalid capacity values", () => {
    expect(eventTableInputSchema.safeParse({ eventId: "x", zoneId: "x" }).success).toBe(false);
  });

  it("derives buyer-safe availability labels", () => {
    expect(tableAvailabilityLabel("available")).toBe("Disponible");
    expect(tableAvailabilityLabel("held")).toBe("Reservada temporalmente");
    expect(tableAvailabilityLabel("sold")).toBe("Vendida");
    expect(tableAvailabilityLabel("available", false)).toBe("Deshabilitada");
  });
});
