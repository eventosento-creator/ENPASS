import { describe, expect, it } from "vitest";
import { customPeriodRange } from "./custom-range";

describe("rango personalizado del resumen", () => {
  it("incluye el día final completo, en hora de Argentina", () => {
    const range = customPeriodRange("2026-10-24", "2026-10-26")!;
    expect(range.from).toBe("2026-10-24T03:00:00.000Z");
    expect(range.to).toBe("2026-10-27T03:00:00.000Z");
  });
  it("acepta un solo día", () => {
    const range = customPeriodRange("2026-11-05", "2026-11-05")!;
    expect(range.to).toBe("2026-11-06T03:00:00.000Z");
  });
  it("rechaza lo vacío, mal escrito, inexistente, al revés o de más de un año", () => {
    expect(customPeriodRange(undefined, "2026-11-05")).toBeNull();
    expect(customPeriodRange("05/11/2026", "2026-11-06")).toBeNull();
    expect(customPeriodRange("2026-02-31", "2026-03-05")).toBeNull();
    expect(customPeriodRange("2026-11-06", "2026-11-05")).toBeNull();
    expect(customPeriodRange("2025-01-01", "2026-11-05")).toBeNull();
  });
});
