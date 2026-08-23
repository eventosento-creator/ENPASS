import { describe, expect, it } from "vitest";
import { mapMercadoPagoStatus } from "./status";

describe("Mercado Pago status mapper", () => {
  it.each([
    ["pending", "pending"],
    ["in_process", "processing"],
    ["approved", "approved"],
    ["rejected", "rejected"],
    ["cancelled", "cancelled"],
    ["charged_back", "charged_back"],
  ] as const)("mapea %s", (provider, expected) => {
    expect(mapMercadoPagoStatus(provider, 0, 10_000)).toBe(expected);
  });

  it("distingue refund total y parcial", () => {
    expect(mapMercadoPagoStatus("refunded", 10_000, 10_000)).toBe("refunded");
    expect(mapMercadoPagoStatus("refunded", 2_000, 10_000)).toBe("partially_refunded");
  });
});
