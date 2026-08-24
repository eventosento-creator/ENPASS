import { describe, expect, it } from "vitest";
import { calculateCommission, commissionValueFromDisplay } from "./commission";

describe("promoter commission", () => {
  it("multiplies a fixed amount by ticket quantity", () => {
    expect(calculateCommission({ type: "fixed_per_ticket", value: 100_000 }, { unitBaseAmount: 1_600_000, quantity: 3 })).toBe(300_000);
  });

  it("calculates percentage in basis points", () => {
    expect(calculateCommission({ type: "percentage", value: 500 }, { unitBaseAmount: 1_000_000, quantity: 1 })).toBe(50_000);
  });

  it("only accepts ticket base price, so a service fee cannot enter the calculation", () => {
    const ticketBase = 1_000_000;
    const serviceFee = 80_000;
    expect(calculateCommission({ type: "percentage", value: 500 }, { unitBaseAmount: ticketBase, quantity: 1 })).toBe(50_000);
    expect(calculateCommission({ type: "percentage", value: 500 }, { unitBaseAmount: ticketBase, quantity: 1 })).not.toBe(Math.round((ticketBase + serviceFee) * 0.05));
  });

  it("uses round half up for non-divisible minor units", () => {
    expect(calculateCommission({ type: "percentage", value: 500 }, { unitBaseAmount: 110, quantity: 1 })).toBe(6);
  });

  it("preserves separate results for TicketType overrides", () => {
    expect(calculateCommission({ type: "percentage", value: 500 }, { unitBaseAmount: 1_600_000, quantity: 1 })).toBe(80_000);
    expect(calculateCommission({ type: "percentage", value: 800 }, { unitBaseAmount: 1_300_000, quantity: 1 })).toBe(104_000);
  });

  it("converts pesos and percentages to their integer storage units", () => {
    expect(commissionValueFromDisplay("fixed_per_ticket", 1_000)).toBe(100_000);
    expect(commissionValueFromDisplay("percentage", 5)).toBe(500);
  });

  it("rejects percentage values above 100 percent", () => {
    expect(() => commissionValueFromDisplay("percentage", 100.01)).toThrow("INVALID_COMMISSION_VALUE");
  });
});
