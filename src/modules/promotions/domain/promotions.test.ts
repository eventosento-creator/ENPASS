import { describe, expect, it } from "vitest";
import { checkoutTotals, csvCell, describeDiscount, isoToLocalInput, localToIso, promotionCodeFromError, promotionErrorMessage, promotionFormSchema, toCentavos, toCsv } from "./promotions";

const money = (centavos: number) => `$${centavos / 100}`;

describe("checkoutTotals", () => {
  it("sin cupón no cambia nada", () => {
    expect(checkoutTotals({ listSubtotal: 2_000_000, serviceFee: 240_000, preview: null })).toEqual({ discount: 0, courtesy: false, serviceFee: 240_000, subtotal: 2_000_000, total: 2_240_000 });
  });
  it("el descuento baja el subtotal y NO el cargo de servicio", () => {
    const totals = checkoutTotals({ listSubtotal: 2_000_000, serviceFee: 240_000, preview: { valid: true, discount_amount: 400_000 } });
    expect(totals).toMatchObject({ discount: 400_000, subtotal: 1_600_000, serviceFee: 240_000, total: 1_840_000 });
  });
  it("el descuento nunca supera el precio (no hay totales negativos)", () => {
    expect(checkoutTotals({ listSubtotal: 1_000_000, serviceFee: 120_000, preview: { valid: true, discount_amount: 9_000_000 } })).toMatchObject({ subtotal: 0, total: 120_000 });
  });
  it("el cupón 100% se trata como cortesía: sin cargo y total 0", () => {
    expect(checkoutTotals({ listSubtotal: 2_000_000, serviceFee: 240_000, preview: { valid: true, courtesy: true, discount_amount: 2_000_000 } })).toMatchObject({ courtesy: true, serviceFee: 0, total: 0 });
  });
  it("un código inválido no descuenta", () => {
    expect(checkoutTotals({ listSubtotal: 1_000_000, serviceFee: 120_000, preview: { valid: false, error: "CODE_EXPIRED", discount_amount: 500_000 } }).total).toBe(1_120_000);
  });
});

describe("mensajes de error", () => {
  it("traduce los códigos del motor", () => {
    expect(promotionErrorMessage("CODE_EXPIRED")).toBe("Este código venció.");
    expect(promotionErrorMessage("CODE_MIN_TICKETS", { min: 3 })).toContain("al menos 3 entradas");
    expect(promotionErrorMessage("CODE_FREE_LIMIT", { max: 1 })).toContain("hasta 1 entrada ");
    expect(promotionErrorMessage("ALGO_RARO")).toContain("No pudimos validar");
  });
  it("extrae el código de un mensaje de la base", () => {
    expect(promotionCodeFromError("CODE_EXHAUSTED")).toBe("CODE_EXHAUSTED");
    expect(promotionCodeFromError("algo falló: CODE_BUYER_LIMIT (detalle)")).toBe("CODE_BUYER_LIMIT");
    expect(promotionCodeFromError("EVENT_UNAVAILABLE")).toBeNull();
  });
});

describe("descripciones y fechas", () => {
  it("describe cada tipo", () => {
    expect(describeDiscount({ kind: "percent", percent_bps: 2000, fixed_amount: null, special_price_amount: null, max_tickets_benefited: null }, money)).toBe("20%");
    expect(describeDiscount({ kind: "fixed", percent_bps: null, fixed_amount: 500_000, special_price_amount: null, max_tickets_benefited: null }, money)).toBe("$5000 por entrada");
    expect(describeDiscount({ kind: "two_for_one", percent_bps: null, fixed_amount: null, special_price_amount: null, max_tickets_benefited: null }, money)).toBe("2×1");
  });
  it("convierte hora de Argentina a UTC y de vuelta", () => {
    expect(localToIso("2026-12-20T23:00")).toBe("2026-12-21T02:00:00.000Z");
    expect(isoToLocalInput("2026-12-21T02:00:00.000Z")).toBe("2026-12-20T23:00");
    expect(localToIso("")).toBeNull();
  });
  it("pesos a centavos sin errores de redondeo", () => {
    expect(toCentavos(10.1)).toBe(1010);
    expect(toCentavos(undefined)).toBeNull();
  });
});

describe("formulario", () => {
  const base = { organizationId: "22222222-2222-4222-8222-222222222222", name: "Fiesta", code: "ELIAS20", kind: "percent", percent: "20" };
  it("acepta un porcentaje válido y deja vacíos los límites opcionales", () => {
    const parsed = promotionFormSchema.safeParse({ ...base, maxTotalUses: "", eventIds: [] });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.maxTotalUses).toBeUndefined();
  });
  it("rechaza un porcentaje de 100 o más (para eso está el tipo 100%)", () => {
    expect(promotionFormSchema.safeParse({ ...base, percent: "100" }).success).toBe(false);
  });
});

describe("CSV", () => {
  it("escapa comas y comillas", () => {
    expect(csvCell('Pérez, "Juan"')).toBe('"Pérez, ""Juan"""');
  });
  it("neutraliza fórmulas de planilla", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("+54911")).toBe("'+54911");
  });
  it("arma el archivo con encabezado y BOM", () => {
    expect(toCsv(["Código", "Usos"], [["ELIAS20", 3]])).toBe("﻿Código,Usos\r\nELIAS20,3\r\n");
  });
});
