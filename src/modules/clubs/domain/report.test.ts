import { describe, expect, it } from "vitest";
import { parseClubPeriod, resolveClubPeriod, shortMonthLabel } from "./report";

describe("reportes del club", () => {
  const now = new Date("2026-10-07T15:00:00Z");
  it("este mes arranca a la medianoche de Argentina", () => {
    const { from, to } = resolveClubPeriod("month", now);
    expect(from.toISOString()).toBe("2026-10-01T03:00:00.000Z");
    expect(to.toISOString()).toBe("2026-11-01T03:00:00.000Z");
  });
  it("mes anterior, últimos 3 meses y año", () => {
    expect(resolveClubPeriod("prev-month", now).from.toISOString()).toBe("2026-09-01T03:00:00.000Z");
    expect(resolveClubPeriod("3m", now).from.toISOString()).toBe("2026-08-01T03:00:00.000Z");
    expect(resolveClubPeriod("year", now).to.toISOString()).toBe("2027-01-01T03:00:00.000Z");
  });
  it("no se corre de mes por la zona horaria (1° a las 01:00 de Argentina sigue siendo el mes nuevo)", () => {
    expect(resolveClubPeriod("month", new Date("2026-11-01T04:00:00Z")).from.toISOString()).toBe("2026-11-01T03:00:00.000Z");
    expect(resolveClubPeriod("month", new Date("2026-11-01T02:00:00Z")).from.toISOString()).toBe("2026-10-01T03:00:00.000Z");
  });
  it("valida el período recibido por la URL", () => {
    expect(parseClubPeriod("3m")).toBe("3m");
    expect(parseClubPeriod("cualquiera")).toBe("month");
    expect(parseClubPeriod(undefined)).toBe("month");
  });
  it("etiqueta de mes corta", () => { expect(shortMonthLabel("2026-05")).toBe("may"); });
});
