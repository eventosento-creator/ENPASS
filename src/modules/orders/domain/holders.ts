import type { z } from "zod";
import type { checkoutSelectionSchema } from "./checkout";

type Selection = z.infer<typeof checkoutSelectionSchema>;

export type TicketUnit = { ticketTypeId: string; unitIndex: number };
export type HolderPayload = { ticket_type_id: string; unit_index: number; first_name: string; last_name: string; document: string | null };

/** Cada entrada comprada = una "posición" (1..N en el orden de la compra). La posición 1 es del comprador; las demás llevan su propio titular. */
export function expectedTicketUnits(selections: Selection[]): TicketUnit[] {
  return selections.filter((selection) => selection.item_type === "ticket")
    .flatMap((selection) => Array.from({ length: selection.quantity }, (_, index) => ({ ticketTypeId: selection.item_id, unitIndex: index + 1 })));
}

export const holderFieldNames = (position: number) => ({ first: `holderFirst_${position}`, last: `holderLast_${position}`, document: `holderDoc_${position}` });

export function cleanDocument(value: string) {
  return value.replace(/[.\s-]/g, "");
}

export type ParseHoldersResult = { ok: true; holders: HolderPayload[] } | { ok: false; error: string };

/** Arma los titulares desde el formulario. Nunca confía en lo que mande el navegador sobre qué entrada es cuál: la posición sale de la compra. */
export function parseHolders(input: {
  units: TicketUnit[];
  buyer: { firstName: string; lastName: string; document: string };
  requireDocument: boolean;
  field: (name: string) => string;
}): ParseHoldersResult {
  const holders: HolderPayload[] = [];
  for (const [index, unit] of input.units.entries()) {
    const position = index + 1;
    if (position === 1) {
      holders.push({ ticket_type_id: unit.ticketTypeId, unit_index: unit.unitIndex, first_name: input.buyer.firstName, last_name: input.buyer.lastName, document: cleanDocument(input.buyer.document) || null });
      continue;
    }
    const names = holderFieldNames(position);
    const first = input.field(names.first).trim();
    const last = input.field(names.last).trim();
    const document = cleanDocument(input.field(names.document));
    if (!first || !last) return { ok: false, error: `Completá el nombre y el apellido de la entrada ${position}.` };
    if (first.length > 80 || last.length > 80) return { ok: false, error: `El nombre de la entrada ${position} es demasiado largo.` };
    if (document && !/^\d{7,8}$/.test(document)) return { ok: false, error: `El DNI de la entrada ${position} no es válido: ingresá solo números.` };
    if (input.requireDocument && !document) return { ok: false, error: `Este evento pide el DNI de cada persona: falta el de la entrada ${position}.` };
    holders.push({ ticket_type_id: unit.ticketTypeId, unit_index: unit.unitIndex, first_name: first, last_name: last, document: document || null });
  }
  return { ok: true, holders };
}
