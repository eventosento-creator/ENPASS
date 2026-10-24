import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

export type GuestPdfInput = { eventName: string; dateLabel: string; guests: { name: string; count?: number }[] };

const MAX_BOXES = 5;

const PAGE = { width: 595.28, height: 841.89 }; // A4
const MARGIN = 40;
const ROW_HEIGHT = 17;
const HEADER_HEIGHT = 74;
const FOOTER_HEIGHT = 34;
const COLUMN_GAP = 24;

/** Las fuentes estándar de PDF cubren Latin-1 (tildes y ñ de nuestros nombres); lo que no entre se reemplaza para no romper el archivo. */
function safeText(font: PDFFont, value: string) {
  const supported = new Set(font.getCharacterSet());
  return [...value.normalize("NFC")].map((char) => (supported.has(char.codePointAt(0)!) ? char : "?")).join("");
}

function fit(font: PDFFont, text: string, size: number, maxWidth: number) {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && font.widthOfTextAtSize(`${cut}…`, size) > maxWidth) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}...`;
}

/** Lista de invitados en A4: dos columnas por hoja, número, casillero para tildar y nombre; encabezado y pie en cada hoja. */
export async function buildGuestListPdf({ eventName, dateLabel, guests }: GuestPdfInput) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const totalTickets = guests.reduce((sum, guest) => sum + Math.max(1, guest.count ?? 1), 0);
  const title = safeText(bold, eventName);
  const subtitle = safeText(regular, `Lista de invitados · ${dateLabel} · ${guests.length} ${guests.length === 1 ? "persona" : "personas"}${totalTickets !== guests.length ? ` · ${totalTickets} entradas` : ""}`);
  const columnWidth = (PAGE.width - MARGIN * 2 - COLUMN_GAP) / 2;
  const rowsPerColumn = Math.floor((PAGE.height - MARGIN - HEADER_HEIGHT - FOOTER_HEIGHT - MARGIN / 2) / ROW_HEIGHT);
  const perPage = rowsPerColumn * 2;
  const pageCount = Math.max(1, Math.ceil(guests.length / perPage));
  const generated = new Date().toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    const page = pdf.addPage([PAGE.width, PAGE.height]);
    page.drawText(fit(bold, title, 18, PAGE.width - MARGIN * 2), { x: MARGIN, y: PAGE.height - MARGIN - 14, size: 18, font: bold, color: rgb(0.05, 0.05, 0.06) });
    page.drawText(fit(regular, subtitle, 10, PAGE.width - MARGIN * 2), { x: MARGIN, y: PAGE.height - MARGIN - 32, size: 10, font: regular, color: rgb(0.35, 0.35, 0.38) });
    page.drawLine({ start: { x: MARGIN, y: PAGE.height - MARGIN - 44 }, end: { x: PAGE.width - MARGIN, y: PAGE.height - MARGIN - 44 }, thickness: 0.8, color: rgb(0.8, 0.8, 0.82) });
    const pageGuests = guests.slice(pageIndex * perPage, (pageIndex + 1) * perPage);
    pageGuests.forEach((guest, index) => {
      const column = Math.floor(index / rowsPerColumn);
      const row = index % rowsPerColumn;
      const x = MARGIN + column * (columnWidth + COLUMN_GAP);
      const y = PAGE.height - MARGIN - HEADER_HEIGHT - row * ROW_HEIGHT;
      const number = pageIndex * perPage + index + 1;
      const count = Math.max(1, guest.count ?? 1);
      // Un casillero por entrada (para tildar cada ingreso); si son muchas, un solo casillero y "x7".
      const boxes = count <= MAX_BOXES ? count : 1;
      const boxesWidth = boxes * 12 + (count > MAX_BOXES ? 22 : 0);
      page.drawText(String(number), { x, y, size: 8, font: regular, color: rgb(0.5, 0.5, 0.53) });
      page.drawText(fit(regular, safeText(regular, guest.name), 10, columnWidth - 24 - boxesWidth - 8), { x: x + 24, y, size: 10, font: regular, color: rgb(0.05, 0.05, 0.06) });
      for (let box = 0; box < boxes; box++) {
        page.drawRectangle({ x: x + columnWidth - boxesWidth + box * 12, y: y - 2, width: 9, height: 9, borderWidth: 0.8, borderColor: rgb(0.3, 0.3, 0.33) });
      }
      if (count > MAX_BOXES) page.drawText(`x${count}`, { x: x + columnWidth - 22, y, size: 9, font: bold, color: rgb(0.05, 0.05, 0.06) });
      page.drawLine({ start: { x, y: y - 6 }, end: { x: x + columnWidth, y: y - 6 }, thickness: 0.3, color: rgb(0.88, 0.88, 0.9) });
    });
    if (!guests.length) page.drawText("Todavía no hay invitados con entrada vigente.", { x: MARGIN, y: PAGE.height - MARGIN - HEADER_HEIGHT, size: 11, font: regular, color: rgb(0.35, 0.35, 0.38) });
    page.drawText(`ENPASS · generada el ${generated}`, { x: MARGIN, y: MARGIN / 2 + 4, size: 8, font: regular, color: rgb(0.55, 0.55, 0.58) });
    const pageLabel = `Hoja ${pageIndex + 1} de ${pageCount}`;
    page.drawText(pageLabel, { x: PAGE.width - MARGIN - regular.widthOfTextAtSize(pageLabel, 8), y: MARGIN / 2 + 4, size: 8, font: regular, color: rgb(0.55, 0.55, 0.58) });
  }
  return pdf.save();
}
