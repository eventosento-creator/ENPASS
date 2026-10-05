import { describe, expect, it } from "vitest";
import { computeDelta, fillSeries, formatCompactMoney, parseReportFilters, resolveGroup, resolvePeriod } from "./report";

// 2026-10-05 15:00 UTC = 12:00 en Argentina.
const NOW = new Date("2026-10-05T15:00:00Z");

describe("períodos de reportes (hora argentina)", () => {
  it("hoy y últimos días", () => {
    const today = resolvePeriod({ period: "today" }, NOW);
    expect(today.from.toISOString()).toBe("2026-10-05T03:00:00.000Z");
    expect(today.to.toISOString()).toBe("2026-10-06T03:00:00.000Z");
    const week = resolvePeriod({ period: "7d" }, NOW);
    expect(week.from.toISOString()).toBe("2026-09-29T03:00:00.000Z");
  });
  it("mes actual, anterior y año", () => {
    expect(resolvePeriod({ period: "month" }, NOW).from.toISOString()).toBe("2026-10-01T03:00:00.000Z");
    const prev = resolvePeriod({ period: "prev-month" }, NOW);
    expect([prev.from.toISOString(), prev.to.toISOString()]).toEqual(["2026-09-01T03:00:00.000Z", "2026-10-01T03:00:00.000Z"]);
    expect(resolvePeriod({ period: "year" }, NOW).to.toISOString()).toBe("2027-01-01T03:00:00.000Z");
  });
  it("personalizado incluye el día final y cae a 30 días si es inválido", () => {
    const custom = resolvePeriod({ period: "custom", from: "2026-10-01", to: "2026-10-03" }, NOW);
    expect([custom.from.toISOString(), custom.to.toISOString()]).toEqual(["2026-10-01T03:00:00.000Z", "2026-10-04T03:00:00.000Z"]);
    const fallback = resolvePeriod({ period: "custom", from: "x", to: "y" }, NOW);
    expect((fallback.to.getTime() - fallback.from.getTime()) / 86_400_000).toBe(30);
  });
});

describe("agrupación y serie", () => {
  it("elige la agrupación según el largo y no permite hora en rangos largos", () => {
    const day = { from: new Date("2026-10-05T03:00:00Z"), to: new Date("2026-10-06T03:00:00Z") };
    const month = { from: new Date("2026-09-06T03:00:00Z"), to: new Date("2026-10-06T03:00:00Z") };
    expect(resolveGroup(undefined, day)).toBe("hour");
    expect(resolveGroup(undefined, month)).toBe("day");
    expect(resolveGroup("hour", month)).toBe("day");
  });
  it("rellena con ceros los días sin ventas", () => {
    const range = { from: new Date("2026-10-01T03:00:00Z"), to: new Date("2026-10-04T03:00:00Z") };
    const filled = fillSeries([{ bucket: "2026-10-02T00:00:00", revenue: 500, units: 2, ops: 1, buyers: 1 }], range, "day");
    expect(filled.map((row) => [row.key.slice(0, 10), row.revenue])).toEqual([["2026-10-01", 0], ["2026-10-02", 500], ["2026-10-03", 0]]);
  });
});

describe("variaciones y formatos", () => {
  it("compara con el período anterior sin inventar porcentajes", () => {
    expect(computeDelta(120, 100)).toEqual({ pct: 20, direction: "up" });
    expect(computeDelta(80, 100).direction).toBe("down");
    expect(computeDelta(50, 0)).toEqual({ pct: null, direction: "new" });
    expect(computeDelta(0, 0).direction).toBe("flat");
  });
  it("formatea importes compactos", () => {
    expect(formatCompactMoney(1_285_000_000)).toBe("$ 12,9M");
    expect(formatCompactMoney(50_000_000)).toBe("$ 500K");
    expect(formatCompactMoney(250_000)).toBe("$ 2.500");
  });
  it("sanea los filtros de la URL", () => {
    const filters = parseReportFilters({ period: "raro", event: "no-uuid", canal: "online", estado: "x", ciudad: " Mendoza " });
    expect(filters).toMatchObject({ period: "30d", event: undefined, channel: "online", status: undefined, city: "Mendoza" });
  });
});
