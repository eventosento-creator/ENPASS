import { describe, expect, it } from "vitest";
import { financeResult, parseMonth, pesosToCents, shiftMonth, type FinanceMonth } from "./finance";

const base: FinanceMonth = { tickets_fees: 0, tickets_count: 0, dues_fees: 0, mp_cost_enpass: 0, avg_fee_per_ticket: null, expenses: [], recurring: [] };
const expense = (amount_cents: number, kind: "fijo" | "variable") => ({ id: "x", expense_date: "2026-11-01", concept: "c", category: "otros", amount_cents, kind, notes: null });

describe("caja de ENPASS", () => {
  it("lee el mes de la dirección o usa el actual en hora argentina", () => {
    expect(parseMonth("2026-03")).toBe("2026-03");
    expect(parseMonth("2026-13", new Date("2026-11-05T12:00:00Z"))).toBe("2026-11");
    expect(parseMonth(undefined, new Date("2026-12-01T01:00:00Z"))).toBe("2026-11"); // 30/11 22:00 en Argentina
  });
  it("cambia de mes cruzando el año", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
  it("entiende los pesos como se escriben acá", () => {
    expect(pesosToCents("25.000")).toBe(2_500_000);
    expect(pesosToCents("$ 1.234,56")).toBe(123_456);
    expect(pesosToCents("25000,5")).toBe(2_500_050);
    expect(pesosToCents("1500.50")).toBe(150_050);
    expect(pesosToCents("0")).toBeNull();
    expect(pesosToCents("abc")).toBeNull();
  });
  it("arma ingresos, gastos, resultado y punto de equilibrio", () => {
    const data: FinanceMonth = {
      ...base, tickets_fees: 5_000_000, dues_fees: 1_000_000, mp_cost_enpass: 100_000, avg_fee_per_ticket: 200_000,
      recurring: [{ id: "r", concept: "Vercel", category: "infraestructura", amount_cents: 2_000_000, starts_on: "2026-01-01", ends_on: null }],
      expenses: [expense(500_000, "fijo"), expense(300_000, "variable")],
    };
    const result = financeResult(data);
    expect(result.income).toBe(6_000_000);
    expect(result.fixed).toBe(2_500_000);
    expect(result.expenses).toBe(2_500_000 + 300_000 + 100_000);
    expect(result.result).toBe(6_000_000 - 2_900_000);
    expect(result.breakEvenTickets).toBe(13); // 25.000 / 2.000 por entrada, redondeado para arriba
  });
  it("sin ventas recientes no inventa un punto de equilibrio", () => {
    expect(financeResult(base).breakEvenTickets).toBeNull();
  });
});
