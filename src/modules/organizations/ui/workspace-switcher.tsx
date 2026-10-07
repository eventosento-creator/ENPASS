"use client";

import { useRef } from "react";
import { switchWorkspace } from "../application/actions";

type Option = { id: string; name: string; staff: boolean };

/** Selector de espacio: aparece solo si la persona tiene acceso a más de uno. */
export function WorkspaceSwitcher({ currentId, options, compact = false }: { currentId: string; options: Option[]; compact?: boolean }) {
  const form = useRef<HTMLFormElement>(null);
  return <form ref={form} action={switchWorkspace} className="min-w-0">
    <label className="sr-only" htmlFor={compact ? "workspace-compact" : "workspace-select"}>Cambiar de espacio</label>
    <select id={compact ? "workspace-compact" : "workspace-select"} name="organizationId" defaultValue={currentId} onChange={() => form.current?.requestSubmit()}
      className={`w-full truncate rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] font-black tracking-[-.02em] ${compact ? "min-h-9 px-2 py-1 text-xs" : "min-h-11 px-3 py-2 text-base"}`}>
      {options.map((option) => <option key={option.id} value={option.id}>{option.name}{option.staff ? " (colaborador)" : ""}</option>)}
    </select>
  </form>;
}
