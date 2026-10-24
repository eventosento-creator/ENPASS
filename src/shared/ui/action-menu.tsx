"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export type ActionMenuItem = { href: string; label: string; hint?: string; icon?: ReactNode };

/** Botón que despliega una lista de acciones (links). Se cierra con Escape, al tocar afuera o al elegir una opción. */
export function ActionMenu({ label, icon, items, align = "left" }: { label: string; icon?: ReactNode; items: ActionMenuItem[]; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => { if (root.current && !root.current.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); button.current?.focus(); } };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return <div ref={root} className="relative">
    <button ref={button} type="button" className="btn btn-secondary" aria-haspopup="menu" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen((value) => !value)}>
      {icon}{label}<ChevronDown size={16} aria-hidden className={`transition ${open ? "rotate-180" : ""}`}/>
    </button>
    {open && <div id={menuId} role="menu" aria-label={label} className={`absolute z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-raised,var(--background))] p-1.5 shadow-xl ${align === "right" ? "right-0" : "left-0"}`}>
      {items.map((item) => <a key={item.href} role="menuitem" href={item.href} onClick={() => setOpen(false)} className="flex min-h-12 items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-[var(--surface-strong)]">
        {item.icon && <span className="mt-0.5 shrink-0 text-neutral-500" aria-hidden>{item.icon}</span>}
        <span className="min-w-0"><b className="block text-sm">{item.label}</b>{item.hint && <span className="block text-xs leading-5 text-neutral-500">{item.hint}</span>}</span>
      </a>)}
    </div>}
  </div>;
}
