"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { periodLabels, type ReportFilters, type ReportPeriod } from "../domain/report";

const selectBase = "h-10 w-full cursor-pointer appearance-none rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] pl-3.5 pr-9 text-sm font-semibold outline-none transition hover:border-[var(--accent)] focus:border-[var(--accent)]";
const statusLabels = { published: "Publicados", sold_out: "Agotados", finished: "Finalizados" } as const;
const channelLabels = { online: "Online", box_office: "Taquilla" } as const;

/** Período + evento + "Filtros" (canal, estado, ciudad). Todo vive en la URL: se puede compartir y el servidor recalcula el reporte. */
export function ReportsFilters({ filters, events, cities }: { filters: ReportFilters; events: Array<{ id: string; name: string }>; cities: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const activeCount = (filters.channel ? 1 : 0) + (filters.status ? 1 : 0) + (filters.city ? 1 : 0);

  function go(patch: Partial<Record<string, string | undefined>>) {
    const params = new URLSearchParams();
    const current: Record<string, string | undefined> = { period: filters.period, from: filters.from, to: filters.to, event: filters.event, canal: filters.channel, estado: filters.status, ciudad: filters.city, group: filters.group };
    for (const [key, value] of Object.entries({ ...current, ...patch })) if (value && !(key === "period" && value === "30d")) params.set(key, value);
    const query = params.toString();
    router.push((query ? `/app/reportes?${query}` : "/app/reportes") as never, { scroll: false });
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    const onDown = (event: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("keydown", onKey); document.addEventListener("mousedown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, [open]);

  const wrap = (icon: React.ReactNode, select: React.ReactNode) => <div className="relative min-w-0 flex-1 sm:flex-none">{icon}{select}<ChevronDown aria-hidden size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"/></div>;
  return <div className="flex flex-wrap items-center gap-2.5">
    {wrap(<CalendarDays aria-hidden size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]"/>,
      <select aria-label="Período" className={`${selectBase} sm:w-48`} style={{ paddingLeft: "2.4rem" }} value={filters.period} onChange={(event) => go({ period: event.target.value as ReportPeriod, from: undefined, to: undefined, group: undefined })}>{(Object.keys(periodLabels) as ReportPeriod[]).map((key) => <option key={key} value={key}>{periodLabels[key]}</option>)}</select>)}
    {filters.period === "custom" && <div className="flex items-center gap-2"><input aria-label="Desde" type="date" defaultValue={filters.from} className={`${selectBase} !w-auto pr-3`} onChange={(event) => event.target.value && go({ from: event.target.value, to: filters.to ?? event.target.value })}/><span className="text-xs text-[var(--muted)]">a</span><input aria-label="Hasta" type="date" defaultValue={filters.to} className={`${selectBase} !w-auto pr-3`} onChange={(event) => event.target.value && go({ to: event.target.value, from: filters.from ?? event.target.value })}/></div>}
    {wrap(null, <select aria-label="Evento" className={`${selectBase} sm:w-56`} value={filters.event ?? ""} onChange={(event) => go({ event: event.target.value || undefined })}><option value="">Todos los eventos</option>{events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}</select>)}
    <div ref={rootRef} className="relative">
      <button type="button" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((value) => !value)} className={`inline-flex h-10 items-center gap-2 rounded-xl border bg-[var(--surface)] px-3.5 text-sm font-semibold transition hover:border-[var(--accent)] ${activeCount ? "border-[var(--accent)]" : "border-[var(--border-strong)]"}`}><SlidersHorizontal aria-hidden size={15}/>{activeCount ? `Filtros · ${activeCount}` : "Filtros"}</button>
      {open && <>
        <div aria-hidden className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm sm:hidden"/>
        <div role="dialog" aria-label="Filtros" className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-[1.5rem] border border-[var(--border-strong)] bg-[var(--surface)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-[calc(100%+.5rem)] sm:w-80 sm:rounded-[1.1rem]">
          <div className="flex items-center justify-between"><p className="text-base font-black">Filtros</p><button type="button" aria-label="Cerrar" onClick={() => setOpen(false)} className="grid size-8 place-items-center rounded-full hover:bg-[var(--surface-raised)]"><X size={16}/></button></div>
          <label className="label mt-4">Canal de venta<span className="relative block"><select className={selectBase} value={filters.channel ?? ""} onChange={(event) => go({ canal: event.target.value || undefined })}><option value="">Todos</option>{Object.entries(channelLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><ChevronDown aria-hidden size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"/></span></label>
          <label className="label mt-4">Estado del evento<span className="relative block"><select className={selectBase} value={filters.status ?? ""} onChange={(event) => go({ estado: event.target.value || undefined })}><option value="">Todos</option>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><ChevronDown aria-hidden size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"/></span></label>
          {cities.length > 0 && <label className="label mt-4">Ciudad<span className="relative block"><select className={selectBase} value={filters.city ?? ""} onChange={(event) => go({ ciudad: event.target.value || undefined })}><option value="">Todas</option>{cities.map((city) => <option key={city} value={city}>{city}</option>)}</select><ChevronDown aria-hidden size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"/></span></label>}
          <p className="mt-4 text-xs text-[var(--muted)]">Filtrar por RRPP y por tipo de entrada: próximamente.</p>
          {activeCount > 0 && <button type="button" onClick={() => { go({ canal: undefined, estado: undefined, ciudad: undefined }); setOpen(false); }} className="mt-4 w-full text-center text-sm font-bold underline">Limpiar filtros</button>}
        </div>
      </>}
    </div>
  </div>;
}
