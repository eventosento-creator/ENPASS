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

import { computeDuesCharge } from "./dues-fee";

describe("cobro de cuotas: ENPASS absorbe la comisión de Mercado Pago", () => {
  it("cuota $10.000 + 10% con comisión estimada de 5%: la familia paga $11.000 y ENPASS separa $450", () => {
    const charge = computeDuesCharge({ amount: 1_000_000, feeBps: 1000, mpAbsorbBps: 500, enpassCollects: false });
    expect(charge.serviceFee).toBe(100_000);
    expect(charge.total).toBe(1_100_000);
    expect(charge.absorbed).toBe(55_000);          // 5% de $11.000
    expect(charge.marketplaceFee).toBe(45_000);    // $1.000 − $550
  });
  it("el club queda con ≈ la cuota completa", () => {
    const charge = computeDuesCharge({ amount: 1_000_000, feeBps: 1000, mpAbsorbBps: 500, enpassCollects: false });
    const mpFee = 55_000; // si Mercado Pago cobra exactamente lo estimado
    expect(charge.total - mpFee - charge.marketplaceFee).toBe(1_000_000);
  });
  it("sin comisión configurada se comporta como antes (todo el cargo es de ENPASS)", () => {
    const charge = computeDuesCharge({ amount: 1_000_000, feeBps: 1000, mpAbsorbBps: 0, enpassCollects: false });
    expect(charge.absorbed).toBe(0);
    expect(charge.marketplaceFee).toBe(100_000);
  });
  it("nunca absorbe más que su propio cargo", () => {
    const charge = computeDuesCharge({ amount: 1_000_000, feeBps: 200, mpAbsorbBps: 2000, enpassCollects: false });
    expect(charge.marketplaceFee).toBe(0);
    expect(charge.absorbed).toBe(charge.serviceFee);
  });
  it("sin cargo de servicio no se separa nada", () => {
    expect(computeDuesCharge({ amount: 1_000_000, feeBps: 0, mpAbsorbBps: 500, enpassCollects: false })).toEqual({ serviceFee: 0, total: 1_000_000, absorbed: 0, marketplaceFee: 0 });
  });
  it("si cobra ENPASS no hay marketplace_fee", () => {
    expect(computeDuesCharge({ amount: 1_000_000, feeBps: 1000, mpAbsorbBps: 500, enpassCollects: true }).marketplaceFee).toBe(0);
  });
});
