import { describe, expect, it } from "vitest";
import { applyPlan, describePlan } from "./plans";

const plan = (mode: "none" | "percent" | "fixed", discountBps = 0, fixedAmount = 0) => ({ mode, discountBps, fixedAmount });

describe("planes de cobro", () => {
  it("sin plan o plan estándar paga el precio completo", () => {
    expect(applyPlan(2_500_000, null)).toBe(2_500_000);
    expect(applyPlan(2_500_000, plan("none"))).toBe(2_500_000);
  });
  it("descuento en porcentaje", () => {
    expect(applyPlan(2_500_000, plan("percent", 5000))).toBe(1_250_000);
    expect(applyPlan(2_800_000, plan("percent", 2000))).toBe(2_240_000);
  });
  it("becado 100% no paga", () => { expect(applyPlan(2_500_000, plan("percent", 10_000))).toBe(0); });
  it("valor fijo reemplaza el precio de cada cuota", () => {
    expect(applyPlan(2_800_000, plan("fixed", 0, 2_000_000))).toBe(2_000_000);
    expect(applyPlan(2_800_000, plan("fixed", 0, 0))).toBe(0);
  });
  it("explica el plan", () => {
    expect(describePlan(plan("percent", 5000))).toBe("50% de descuento en cada cuota");
    expect(describePlan(plan("percent", 10_000))).toBe("100% de descuento: no paga cuota");
    expect(describePlan(plan("fixed", 0, 0))).toBe("Cuota en $0: no paga");
    expect(describePlan(plan("none"))).toBe("Paga la cuota completa");
  });
});
