"use client";

import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";

/** Botón Exportar preparado para CSV / Excel / PDF: por ahora las opciones están deshabilitadas. */
export function ExportButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return <div ref={ref} className="relative">
    <button type="button" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((value) => !value)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-bold transition hover:border-[var(--accent)]"><Download aria-hidden size={15}/>Exportar</button>
    {open && <div role="menu" className="absolute right-0 top-[calc(100%+.5rem)] z-30 w-52 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] p-1.5 shadow-xl">
      {["CSV", "Excel", "PDF"].map((format) => <button key={format} type="button" role="menuitem" disabled className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold opacity-50">{format}<span className="text-[10px] font-bold uppercase tracking-wider">Próximamente</span></button>)}
    </div>}
  </div>;
}
