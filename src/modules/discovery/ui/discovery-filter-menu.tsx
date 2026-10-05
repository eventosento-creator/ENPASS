"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SlidersHorizontal, X } from "lucide-react";
import type { DiscoveryFilters, DiscoveryPrice, DiscoveryWhen } from "../domain/discovery";
import { buildFilterUrl, priceLabels, whenLabels } from "../domain/discovery-url";

const whenOptions: DiscoveryWhen[] = ["all", "today", "tomorrow", "weekend"];
const priceOptions: Array<DiscoveryPrice | undefined> = [undefined, "free", "paid"];

/** Botón "Filtros": popover en escritorio y bottom sheet en celular. Fecha y precio, sin chips permanentes. */
export function DiscoveryFilterMenu({ filters }: { filters: DiscoveryFilters }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const activeCount = (filters.when !== "all" ? 1 : 0) + (filters.price ? 1 : 0);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    const onDown = (event: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, [open]);

  const optionClass = (active: boolean) => `flex min-h-11 items-center justify-between rounded-xl border px-4 text-sm font-semibold transition ${active ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]" : "border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)]"}`;

  return <div ref={rootRef} className="relative">
    <button type="button" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((value) => !value)} className={`inline-flex h-14 w-full items-center justify-center gap-2.5 rounded-[1.1rem] border px-5 text-[15px] font-bold transition sm:h-16 sm:w-auto ${activeCount ? "border-[var(--accent)]" : "border-[var(--border-strong)]"} bg-[var(--surface)] shadow-[var(--shadow-xs)] hover:border-[var(--accent)]`}>
      <SlidersHorizontal aria-hidden size={18}/>{activeCount ? `Filtros · ${activeCount}` : "Filtros"}
    </button>
    {open && <>
      <div aria-hidden className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm sm:hidden"/>
      <div role="dialog" aria-label="Filtros" className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-[1.5rem] border border-[var(--border-strong)] bg-[var(--surface)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-[calc(100%+.6rem)] sm:w-[22rem] sm:rounded-[1.25rem]">
        <div className="flex items-center justify-between"><p className="text-lg font-black">Filtros</p><button type="button" aria-label="Cerrar" onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-full hover:bg-[var(--surface-raised)]"><X size={18}/></button></div>
        <p className="eyebrow mt-5">Fecha</p>
        <div className="mt-2.5 grid gap-2">{whenOptions.map((value) => <Link key={value} href={buildFilterUrl(filters, { when: value })} onClick={() => setOpen(false)} className={optionClass(filters.when === value)}>{whenLabels[value]}</Link>)}</div>
        <p className="eyebrow mt-6">Precio</p>
        <div className="mt-2.5 grid grid-cols-3 gap-2">{priceOptions.map((value) => <Link key={value ?? "all"} href={buildFilterUrl({ ...filters, price: value })} onClick={() => setOpen(false)} className={`${optionClass(filters.price === value)} justify-center`}>{priceLabels[value ?? "all"]}</Link>)}</div>
        {activeCount > 0 && <Link href={buildFilterUrl(filters, {}, ["when", "price"])} onClick={() => setOpen(false)} className="mt-6 block text-center text-sm font-bold underline">Limpiar filtros</Link>}
      </div>
    </>}
  </div>;
}
