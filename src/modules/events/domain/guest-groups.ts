export type GuestListEntry = { name: string; document: string | null; typeLabel: string; checkedIn: boolean };
export type GuestGroup = { name: string; count: number; checkedIn: number };

// Misma persona escrita distinto ("Maria"/"María", mayúsculas, espacios dobles) = una sola fila con la cantidad de entradas.
const personKey = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const accentScore = (name: string) => (name.normalize("NFD").match(/[\u0300-\u036f]/g) ?? []).length;

/** Agrupa las entradas por persona: nombre (la variante con tildes si hay), cantidad de entradas y cuántas ya ingresaron. */
export function groupGuests(guests: GuestListEntry[]): GuestGroup[] {
  const groups = new Map<string, GuestGroup>();
  for (const guest of guests) {
    const key = personKey(guest.name);
    const current = groups.get(key);
    if (!current) groups.set(key, { name: guest.name, count: 1, checkedIn: guest.checkedIn ? 1 : 0 });
    else {
      current.count += 1;
      if (guest.checkedIn) current.checkedIn += 1;
      if (accentScore(guest.name) > accentScore(current.name)) current.name = guest.name;
    }
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, "es-AR"));
}
