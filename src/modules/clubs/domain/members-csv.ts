/** CSV de socios: Nº Socio, Nombre, Apellido, DNI, Mail, Celular, Categoria, Division. */
export const MEMBERS_CSV_HEADERS = ["Nº Socio", "Nombre", "Apellido", "DNI", "Mail", "Celular", "Categoria", "Division"] as const;
/** Columnas opcionales para alumnos a cargo de un tutor: si "Nombre Alumno" viene completo, Nombre/Apellido/DNI/Mail/Celular son del tutor. */
export const MEMBERS_CSV_STUDENT_HEADERS = ["Nombre Alumno", "Apellido Alumno", "DNI Alumno", "Fecha de Nacimiento"] as const;

/** Parser CSV (comillas, comas/punto y coma, saltos de línea dentro de comillas, BOM). */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) { row.push(cell); cell = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell); cell = "";
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
    } else cell += char;
  }
  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}

/** Escapa una celda; neutraliza fórmulas (=, +, -, @) para que Excel/Sheets no las ejecuten. */
function csvCell(value: string) {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: string[][]) {
  return `﻿${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export function normalizeKey(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export type MemberCsvField = "memberNumber" | "firstName" | "lastName" | "document" | "email" | "phone" | "category" | "division" | "studentFirstName" | "studentLastName" | "studentDocument" | "birthDate";

const headerAliases: Record<string, MemberCsvField> = {
  nsocio: "memberNumber", nrosocio: "memberNumber", numerosocio: "memberNumber", numsocio: "memberNumber", socio: "memberNumber",
  nombre: "firstName", nombres: "firstName", apellido: "lastName", apellidos: "lastName",
  dni: "document", documento: "document", mail: "email", email: "email", correo: "email",
  celular: "phone", telefono: "phone", tel: "phone", categoria: "category", division: "division", divisiones: "division",
  nombrealumno: "studentFirstName", apellidoalumno: "studentLastName", dnialumno: "studentDocument",
  fechadenacimiento: "birthDate", fechanacimiento: "birthDate", nacimiento: "birthDate",
};

export function mapHeaders(headerRow: string[]): Partial<Record<MemberCsvField, number>> {
  const map: Partial<Record<MemberCsvField, number>> = {};
  headerRow.forEach((header, index) => {
    const field = headerAliases[normalizeKey(header)];
    if (field && map[field] === undefined) map[field] = index;
  });
  return map;
}

/** Siguiente número conservando ceros a la izquierda (0009 → 0010). */
export function incrementMemberNumber(value: string) {
  return String(Number(value) + 1).padStart(value.length, "0");
}

/** Fecha de nacimiento en dd/mm/aaaa o aaaa-mm-dd → "aaaa-mm-dd"; null si no existe o es futura. */
export function parseBirthDate(value: string, today = new Date()) {
  const match = value.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/) ?? value.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return null;
  const [year, month, day] = match[3]!.length === 4 ? [Number(match[3]), Number(match[2]), Number(match[1])] : [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || year < 1900 || date > today) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
