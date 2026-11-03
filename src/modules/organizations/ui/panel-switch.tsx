import { CalendarDays, UserRoundCheck } from "lucide-react";
import { switchPanel } from "../application/actions";

/** Botón Eventos | Club: el panel de eventos y el de club son pantallas distintas, y este botón pasa de una a otra. */
export function PanelSwitch({ active, compact = false }: { active: "club" | "events"; compact?: boolean }) {
  const options = [
    { panel: "events", label: "Eventos", icon: CalendarDays },
    { panel: "club", label: "Club", icon: UserRoundCheck },
  ] as const;
  return <div role="group" aria-label="Cambiar de panel" className={`grid grid-cols-2 gap-1 rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-1 ${compact ? "text-xs" : "text-sm"}`}>
    {options.map(({ panel, label, icon: Icon }) => <form action={switchPanel} key={panel}>
      <input type="hidden" name="panel" value={panel}/>
      <button type="submit" aria-pressed={active === panel} className={`flex w-full items-center justify-center gap-2 rounded-xl font-bold transition ${compact ? "min-h-9" : "min-h-10"} ${active === panel ? "bg-[var(--accent)] text-[var(--on-accent)] shadow-[var(--shadow-xs)]" : "text-neutral-500 hover:text-[var(--text)]"}`}><Icon aria-hidden size={compact ? 14 : 16}/>{label}</button>
    </form>)}
  </div>;
}
