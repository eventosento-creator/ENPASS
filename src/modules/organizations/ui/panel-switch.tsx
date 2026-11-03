"use client";

import { useOptimistic, useTransition } from "react";
import { CalendarDays, Loader2, UserRoundCheck } from "lucide-react";
import { switchPanel } from "../application/actions";

const options = [
  { panel: "events", label: "Eventos", icon: CalendarDays },
  { panel: "club", label: "Club", icon: UserRoundCheck },
] as const;

/** Botón Eventos | Club: el panel de eventos y el de club son pantallas distintas, y este botón pasa de una a otra.
 *  Marca el panel elegido al instante y muestra que está cargando, porque cambiar de panel renderiza otra pantalla completa. */
export function PanelSwitch({ active, compact = false }: { active: "club" | "events"; compact?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic(active);
  function choose(panel: "club" | "events") {
    if (pending || panel === shown) return;
    const formData = new FormData();
    formData.set("panel", panel);
    startTransition(async () => {
      setShown(panel);
      await switchPanel(formData);
    });
  }
  return <div role="group" aria-label="Cambiar de panel" aria-busy={pending} className={`grid grid-cols-2 gap-1 rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-1 ${compact ? "text-xs" : "text-sm"}`}>
    {options.map(({ panel, label, icon: Icon }) => <button key={panel} type="button" onClick={() => choose(panel)} aria-pressed={shown === panel} disabled={pending && shown !== panel} className={`flex w-full items-center justify-center gap-2 rounded-xl font-bold transition ${compact ? "min-h-9" : "min-h-10"} ${shown === panel ? "bg-[var(--accent)] text-[var(--on-accent)] shadow-[var(--shadow-xs)]" : "text-neutral-500 hover:text-[var(--text)]"}`}>
      {pending && shown === panel ? <Loader2 aria-hidden size={compact ? 14 : 16} className="animate-spin"/> : <Icon aria-hidden size={compact ? 14 : 16}/>}{label}
    </button>)}
  </div>;
}
