"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";
import { switchWorkspace } from "../application/actions";

export type WorkspaceOption = { id: string; name: string; role: "owner" | "admin" | "staff"; logoUrl: string | null };

const roleLabels = { owner: "Propietario", admin: "Administrador", staff: "Colaborador" } as const;

function Avatar({ option, size }: { option: WorkspaceOption; size: number }) {
  const initial = option.name.trim().charAt(0).toUpperCase() || "E";
  return option.logoUrl
    ? <span className="relative grid shrink-0 place-items-center overflow-hidden rounded-full border border-[var(--border)] bg-white" style={{ width: size, height: size }}><Image src={option.logoUrl} alt="" fill sizes={`${size}px`} className="object-contain p-0.5" unoptimized/></span>
    : <span aria-hidden className="grid shrink-0 place-items-center rounded-full bg-[var(--accent)] font-black text-[var(--on-accent)]" style={{ width: size, height: size, fontSize: size * 0.42 }}>{initial}</span>;
}

/** Selector de espacio: el actual con su rol, la lista de espacios a los que tiene acceso y "Crear club". */
export function WorkspaceSwitcher({ currentId, options, compact = false }: { currentId: string; options: WorkspaceOption[]; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const current = options.find((option) => option.id === currentId) ?? options[0]!;

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return <div ref={root} className="relative min-w-0">
    <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((value) => !value)}
      className={`flex w-full items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-left shadow-[var(--shadow-xs)] transition hover:border-[var(--border-strong)] ${compact ? "min-h-11 px-2 py-1.5" : "px-3 py-2.5"}`}>
      <Avatar option={current} size={compact ? 28 : 40}/>
      <span className="min-w-0 flex-1"><span className={`block truncate font-black tracking-[-.02em] ${compact ? "text-sm" : "text-base"}`}>{current.name}</span>{!compact && <span className="block truncate text-xs font-medium text-[var(--muted)]">{roleLabels[current.role]}</span>}</span>
      <ChevronDown aria-hidden size={compact ? 16 : 18} className={`shrink-0 text-[var(--muted)] transition ${open ? "rotate-180" : ""}`}/>
    </button>

    {open && <div role="listbox" aria-label="Espacios" className={`z-50 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-[var(--shadow-lg)] ${compact ? "fixed inset-x-4 top-[4.25rem] max-h-[70vh] overflow-y-auto" : "absolute left-0 mt-2 w-[min(20rem,calc(100vw-2rem))]"}`}>
      {options.map((option) => {
        const selected = option.id === current.id;
        return <form action={switchWorkspace} key={option.id}>
          <input type="hidden" name="organizationId" value={option.id}/>
          <button type="submit" role="option" aria-selected={selected} className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition ${selected ? "bg-[color-mix(in_srgb,var(--success)_14%,transparent)]" : "hover:bg-[var(--surface-raised)]"}`}>
            <Avatar option={option} size={40}/>
            <span className="min-w-0 flex-1"><span className="block truncate font-black tracking-[-.02em]">{option.name}</span><span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${selected ? "status-success" : "bg-[var(--surface-strong)] text-[var(--muted)]"}`}>{roleLabels[option.role]}</span></span>
            {selected && <span className="grid size-7 shrink-0 place-items-center rounded-full status-success"><Check aria-hidden size={15}/></span>}
          </button>
        </form>;
      })}
      <div className="my-2 h-px bg-[var(--border)]"/>
      <Link href={"/app/onboarding?intent=club&nuevo=1" as never} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 font-bold transition hover:bg-[var(--surface-raised)]">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--surface-strong)]"><Plus aria-hidden size={18}/></span>Crear club
      </Link>
    </div>}
  </div>;
}
