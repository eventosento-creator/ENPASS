import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildGuestListPdf } from "./guest-list-pdf";

const names = (count: number) => Array.from({ length: count }, (_, index) => ({ name: `Apellido${index}, Nombre${index}` }));

describe("buildGuestListPdf", () => {
  it("genera un PDF válido", async () => {
    const bytes = await buildGuestListPdf({ eventName: "Noche 2000", dateLabel: "Sábado 25 de octubre", guests: names(5) });
    expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe("%PDF-");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it("reparte una lista larga en varias hojas", async () => {
    const bytes = await buildGuestListPdf({ eventName: "Fiesta", dateLabel: "hoy", guests: names(400) });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(3);
  });

  it("acepta tildes, ñ y caracteres que la fuente no tiene sin romper el archivo", async () => {
    const bytes = await buildGuestListPdf({ eventName: "Cumpleaños de Ñandú ✨", dateLabel: "hoy", guests: [{ name: "Muñoz, María Laura" }, { name: "Łukasz 田中" }, { name: "Nombre larguísimo ".repeat(12) }] });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it("una lista vacía igual genera una hoja", async () => {
    const bytes = await buildGuestListPdf({ eventName: "Sin ventas", dateLabel: "hoy", guests: [] });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
});
