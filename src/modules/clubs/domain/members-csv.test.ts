import { describe, expect, it } from "vitest";
import { incrementMemberNumber, mapHeaders, parseCsv, toCsv } from "./members-csv";

describe("members csv", () => {
  it("parsea comillas, comas internas y punto y coma", () => {
    expect(parseCsv('a,b\n"x, y","he said ""hi"""\n')).toEqual([["a", "b"], ["x, y", 'he said "hi"']]);
    expect(parseCsv("a;b\r\n1;2\r\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("round-trip con BOM y neutraliza fórmulas", () => {
    const csv = toCsv([["Nombre"], ["=1+1"], ["Ana, María"]]);
    expect(parseCsv(csv)).toEqual([["Nombre"], ["'=1+1"], ["Ana, María"]]);
  });
  it("reconoce los encabezados de la planilla", () => {
    expect(mapHeaders(["Nº Socio", "Nombre", "Apellido", "DNI", "Mail", "Celular", "Categoria", "Division"])).toEqual({
      memberNumber: 0, firstName: 1, lastName: 2, document: 3, email: 4, phone: 5, category: 6, division: 7,
    });
  });
  it("incrementa conservando ceros", () => {
    expect(incrementMemberNumber("0009")).toBe("0010");
    expect(incrementMemberNumber("9")).toBe("10");
  });
});
