import { describe, expect, it } from "vitest";
import { applyBasisPoints, calculateFeeBreakdown } from "./fees";

describe("fees", () => {
  it("calcula buyer-paid sin floats", () => {
    expect(calculateFeeBreakdown(1_000_000, { payer: "buyer", bps: 800 })).toEqual({
      buyerFeeAmount: 80_000,
      producerFeeAmount: 0,
      totalFeeAmount: 80_000,
    });
  });

  it("redondea al centavo más cercano", () => {
    expect(applyBasisPoints(101, 500)).toBe(5);
    expect(applyBasisPoints(110, 500)).toBe(6);
  });

  it("acepta fee cero", () => {
    expect(calculateFeeBreakdown(10_000, { payer: "buyer", bps: 0 }).totalFeeAmount).toBe(0);
  });

  it("mantiene producer-paid y mixed explícitos", () => {
    expect(calculateFeeBreakdown(100_000, { payer: "producer", bps: 500 })).toEqual({
      buyerFeeAmount: 0,
      producerFeeAmount: 5_000,
      totalFeeAmount: 5_000,
    });
    expect(calculateFeeBreakdown(100_000, { payer: "mixed", buyerBps: 300, producerBps: 200 })).toEqual({
      buyerFeeAmount: 3_000,
      producerFeeAmount: 2_000,
      totalFeeAmount: 5_000,
    });
  });
});
