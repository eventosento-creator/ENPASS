import { describe, expect, it } from "vitest";
import { applyBasisPoints } from "@/modules/payments/domain/fees";

// Acuerdo con los clubes: la familia paga la cuota + un % de cargo de servicio; el club recibe la cuota completa.
describe("cargo de servicio en cuotas de clubes", () => {
  it("10% sobre una cuota de $10.000 son $1.000 y la familia paga $11.000", () => {
    const amount = 1_000_000; // centavos
    const fee = applyBasisPoints(amount, 1000);
    expect(fee).toBe(100_000);
    expect(amount + fee).toBe(1_100_000);
  });
  it("sin cargo configurado no suma nada", () => {
    expect(applyBasisPoints(1_000_000, 0)).toBe(0);
  });
  it("redondea al centavo", () => {
    expect(Number.isInteger(applyBasisPoints(333_333, 1000))).toBe(true);
  });
});
