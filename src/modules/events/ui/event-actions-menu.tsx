"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";

export function EventActionsMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return <div className="relative" ref={ref}>
    <button type="button" aria-label="Más acciones" aria-expanded={open} className="btn btn-secondary btn-icon" onClick={() => setOpen((value) => !value)}><MoreHorizontal size={18}/></button>
    {open && <div className="absolute right-0 top-[calc(100%+8px)] z-30 grid w-64 gap-1 rounded-2xl border border-white/10 bg-[var(--surface)] p-2 shadow-2xl" onClick={() => setOpen(false)}>{children}</div>}
  </div>;
}
