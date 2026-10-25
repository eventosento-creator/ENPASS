import { describe, expect, it } from "vitest";
import { analyzeGateCoverage, hasCoverageProblem } from "./gate-coverage";

const type = (id: string, name = id, active = true) => ({ id, name, active });
const gate = (id: string, active = true) => ({ id, active });
const rule = (gateId: string, typeId: string) => ({ access_gate_id: gateId, ticket_type_id: typeId });

describe("analyzeGateCoverage", () => {
  it("sin problemas cuando cada tipo activo pasa por alguna puerta operativa", () => {
    const coverage = analyzeGateCoverage({ ticketTypes: [type("a"), type("b")], gates: [gate("g1"), gate("g2")], rules: [rule("g1", "a"), rule("g2", "b")] });
    expect(hasCoverageProblem(coverage)).toBe(false);
  });

  it("detecta una entrada creada después de las puertas (el caso del scanner que rechazaba todo)", () => {
    const coverage = analyzeGateCoverage({ ticketTypes: [type("a", "General"), type("b", "Puerta Principal")], gates: [gate("g1")], rules: [rule("g1", "a")] });
    expect(coverage.uncovered).toEqual([{ id: "b", name: "Puerta Principal" }]);
    expect(hasCoverageProblem(coverage)).toBe(true);
  });

  it("avisa cuando no hay ninguna puerta", () => {
    const coverage = analyzeGateCoverage({ ticketTypes: [type("a")], gates: [], rules: [] });
    expect(coverage.noGates).toBe(true);
    expect(coverage.uncovered).toEqual([]);
  });

  it("avisa cuando todas las puertas están desactivadas", () => {
    const coverage = analyzeGateCoverage({ ticketTypes: [type("a")], gates: [gate("g1", false)], rules: [rule("g1", "a")] });
    expect(coverage.noActiveGates).toBe(true);
    expect(coverage.uncovered.map((item) => item.id)).toEqual(["a"]);
  });

  it("una regla en una puerta desactivada no cuenta como cobertura", () => {
    const coverage = analyzeGateCoverage({ ticketTypes: [type("a")], gates: [gate("g1", false), gate("g2")], rules: [rule("g1", "a")] });
    expect(coverage.uncovered.map((item) => item.id)).toEqual(["a"]);
  });

  it("ignora los tipos de entrada desactivados y un evento sin entradas", () => {
    expect(hasCoverageProblem(analyzeGateCoverage({ ticketTypes: [type("a", "Vieja", false)], gates: [gate("g1")], rules: [] }))).toBe(false);
    expect(hasCoverageProblem(analyzeGateCoverage({ ticketTypes: [], gates: [], rules: [] }))).toBe(false);
  });
});
