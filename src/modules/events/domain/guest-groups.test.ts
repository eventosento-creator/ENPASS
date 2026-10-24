import { describe, expect, it } from "vitest";
import { groupGuests } from "./guest-groups";

const guest = (name: string, checkedIn = false) => ({ name, document: null, typeLabel: "General", checkedIn });

describe("groupGuests", () => {
  it("junta las entradas de una misma persona y cuenta cuántas son", () => {
    const groups = groupGuests([guest("Barbeito, Guillermo"), guest("Barbeito, Guillermo"), guest("Barbeito, Guillermo"), guest("Beron, Antonella")]);
    expect(groups).toEqual([{ name: "Barbeito, Guillermo", count: 3, checkedIn: 0 }, { name: "Beron, Antonella", count: 1, checkedIn: 0 }]);
  });

  it("unifica tildes, mayúsculas y espacios, y muestra la variante con tilde", () => {
    const groups = groupGuests([guest("Muñoz, Maria Laura"), guest("Muñoz, María Laura"), guest("MUÑOZ,  MARIA LAURA")]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ name: "Muñoz, María Laura", count: 3 });
  });

  it("cuenta cuántas de las entradas de la persona ya ingresaron", () => {
    const [group] = groupGuests([guest("Pérez, José", true), guest("Pérez, José", false)]);
    expect(group).toMatchObject({ count: 2, checkedIn: 1 });
  });

  it("ordena alfabéticamente respetando el castellano", () => {
    const names = groupGuests([guest("Ñandú, Pedro"), guest("Zárate, Ana"), guest("Álvarez, Luis"), guest("Morales, Tomas")]).map((group) => group.name);
    expect(names).toEqual(["Álvarez, Luis", "Morales, Tomas", "Ñandú, Pedro", "Zárate, Ana"]);
  });

  it("una lista vacía queda vacía", () => {
    expect(groupGuests([])).toEqual([]);
  });
});
