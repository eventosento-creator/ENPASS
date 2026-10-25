import { describe, expect, it } from "vitest";
import { expectedTicketUnits, parseHolders } from "./holders";

const ticket = (id: string, quantity: number) => ({ item_type: "ticket" as const, item_id: id, quantity });
const buyer = { firstName: "Ana", lastName: "Comprador", document: "30.111.222" };
const fields = (values: Record<string, string>) => (name: string) => values[name] ?? "";

describe("expectedTicketUnits", () => {
  it("una posición por cada entrada, en el orden de la compra", () => {
    const units = expectedTicketUnits([ticket("a", 2), ticket("b", 1)]);
    expect(units).toEqual([{ ticketTypeId: "a", unitIndex: 1 }, { ticketTypeId: "a", unitIndex: 2 }, { ticketTypeId: "b", unitIndex: 1 }]);
  });
  it("ignora mesas y asientos", () => {
    expect(expectedTicketUnits([{ item_type: "table", item_id: "t", quantity: 1 }, ticket("a", 1)])).toEqual([{ ticketTypeId: "a", unitIndex: 1 }]);
  });
});

describe("parseHolders", () => {
  const units = expectedTicketUnits([ticket("a", 2), ticket("b", 1)]);

  it("la primera entrada es del comprador y las demás llevan su propio titular", () => {
    const result = parseHolders({ units, buyer, requireDocument: false, field: fields({ holderFirst_2: "Beto", holderLast_2: "Amigo", holderFirst_3: " Carla ", holderLast_3: "Invitada", holderDoc_3: "27.333.444" }) });
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.holders.map((holder) => holder.first_name)).toEqual(["Ana", "Beto", "Carla"]);
    expect(result.holders[0]?.document).toBe("30111222");
    expect(result.holders[1]?.document).toBeNull();
    expect(result.holders[2]).toMatchObject({ ticket_type_id: "b", unit_index: 1, document: "27333444" });
  });

  it("falta el nombre de una entrada: se rechaza y dice cuál", () => {
    const result = parseHolders({ units, buyer, requireDocument: false, field: fields({ holderFirst_2: "Beto", holderLast_2: "", holderFirst_3: "C", holderLast_3: "D" }) });
    expect(result).toEqual({ ok: false, error: "Completá el nombre y el apellido de la entrada 2." });
  });

  it("si el evento pide DNI, lo exige en cada persona", () => {
    const values = { holderFirst_2: "Beto", holderLast_2: "A", holderDoc_2: "30333444", holderFirst_3: "C", holderLast_3: "D" };
    expect(parseHolders({ units, buyer, requireDocument: true, field: fields(values) })).toMatchObject({ ok: false });
    expect(parseHolders({ units, buyer, requireDocument: true, field: fields({ ...values, holderDoc_3: "28444555" }) })).toMatchObject({ ok: true });
  });

  it("rechaza un DNI mal escrito y nombres larguísimos", () => {
    expect(parseHolders({ units, buyer, requireDocument: false, field: fields({ holderFirst_2: "B", holderLast_2: "A", holderDoc_2: "12", holderFirst_3: "C", holderLast_3: "D" }) })).toMatchObject({ ok: false });
    expect(parseHolders({ units, buyer, requireDocument: false, field: fields({ holderFirst_2: "B".repeat(81), holderLast_2: "A", holderFirst_3: "C", holderLast_3: "D" }) })).toMatchObject({ ok: false });
  });

  it("una sola entrada: solo el comprador", () => {
    const one = expectedTicketUnits([ticket("a", 1)]);
    const result = parseHolders({ units: one, buyer, requireDocument: false, field: fields({}) });
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.holders).toHaveLength(1);
  });
});
