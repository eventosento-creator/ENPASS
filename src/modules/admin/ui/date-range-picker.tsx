type Range = { desde: string; hasta: string } | null;

/** "2026-10-24" → "24/10" (la fecha ya viene validada). */
const shortDay = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

/** Botón "Fechas" con un cuadro desde/hasta que manda el formulario por GET a `action`; `keep` conserva el resto de los filtros. */
export function DateRangePicker({ action, range, keep = {} }: { action: string; range: Range; keep?: Record<string, string> }) {
  return <details className="relative">
    <summary className={`cursor-pointer list-none rounded-full border px-3.5 py-1.5 text-xs font-bold ${range ? "border-transparent bg-[var(--accent)] text-[var(--on-accent)]" : "border-[var(--border-strong)] text-neutral-500"}`}>{range ? `${shortDay(range.desde)} – ${shortDay(range.hasta)}` : "Fechas"}</summary>
    <form action={action} method="get" className="card mt-2 flex flex-wrap items-end gap-2 p-3 sm:absolute sm:left-0 sm:z-10 sm:w-max sm:shadow-lg">
      {Object.entries(keep).map(([name, value]) => <input key={name} type="hidden" name={name} value={value}/>)}
      <label className="grid gap-1 text-xs font-bold text-neutral-500">Desde<input type="date" name="desde" required defaultValue={range?.desde} className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--text)]"/></label>
      <label className="grid gap-1 text-xs font-bold text-neutral-500">Hasta<input type="date" name="hasta" required defaultValue={range?.hasta} className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--text)]"/></label>
      <button type="submit" className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-bold text-[var(--on-accent)]">Ver</button>
    </form>
  </details>;
}
