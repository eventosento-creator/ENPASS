import { describe, expect, it } from "vitest";
import { incrementMemberNumber, mapHeaders, parseBirthDate, parseCsv, toCsv } from "./members-csv";

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
  it("reconoce las columnas del alumno", () => {
    expect(mapHeaders(["Nombre", "Nombre Alumno", "Apellido Alumno", "DNI Alumno", "Fecha de Nacimiento"])).toEqual({ firstName: 0, studentFirstName: 1, studentLastName: 2, studentDocument: 3, birthDate: 4 });
  });
  it("lee fechas de nacimiento", () => {
    const today = new Date("2026-11-04T12:00:00Z");
    expect(parseBirthDate("10/05/2015", today)).toBe("2015-05-10");
    expect(parseBirthDate("2015-5-1", today)).toBe("2015-05-01");
    expect(parseBirthDate("31/02/2015", today)).toBeNull();
    expect(parseBirthDate("01/01/2030", today)).toBeNull();
    expect(parseBirthDate("ayer", today)).toBeNull();
  });
  it("incrementa conservando ceros", () => {
    expect(incrementMemberNumber("0009")).toBe("0010");
    expect(incrementMemberNumber("9")).toBe("10");
  });
});
