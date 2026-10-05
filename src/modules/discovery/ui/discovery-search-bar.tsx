"use client";

import { useRef } from "react";
import { ChevronDown, MapPin, Search } from "lucide-react";
import type { DiscoveryFilters } from "../domain/discovery";

/** Buscador principal: texto + ciudad (dropdown). Mantiene el resto de los filtros como campos ocultos. */
export function DiscoverySearchBar({ cities, filters }: { cities: Array<{ value: string; label: string }>; filters: DiscoveryFilters }) {
  const formRef = useRef<HTMLFormElement>(null);
  return <form ref={formRef} action="/eventos" role="search" className="flex w-full min-w-0 flex-col overflow-hidden sm:flex-1 rounded-[1.1rem] border border-[var(--border-strong)] bg-[var(--surface)] shadow-[var(--shadow-xs)] transition focus-within:border-[var(--accent)] sm:h-16 sm:flex-row sm:items-stretch">
    {filters.category && <input type="hidden" name="category" value={filters.category}/>}
    {filters.when !== "all" && <input type="hidden" name="when" value={filters.when}/>}
    {filters.price && <input type="hidden" name="price" value={filters.price}/>}
    <label className="flex h-14 min-w-0 shrink-0 items-center gap-3 px-5 sm:h-auto sm:flex-1">
      <Search aria-hidden size={19} className="shrink-0 text-[var(--muted)]"/>
      <span className="sr-only">Buscar eventos</span>
      <input type="search" name="q" defaultValue={filters.q ?? ""} placeholder="Buscar eventos, artistas, clubes o ciudades…" className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[15px] outline-none placeholder:text-[var(--muted)]"/>
    </label>
    <div className="flex h-12 shrink-0 items-center gap-2 border-t border-[var(--border)] px-5 sm:h-auto sm:min-w-52 sm:border-l sm:border-t-0">
      <MapPin aria-hidden size={17} className="shrink-0 text-[var(--muted)]"/>
      <span className="sr-only">Ciudad</span>
      <select name="city" defaultValue={filters.city ?? ""} onChange={() => formRef.current?.requestSubmit()} className="min-w-0 flex-1 cursor-pointer appearance-none border-0 bg-transparent p-0 text-[15px] font-semibold outline-none">
        <option value="">Todas las ciudades</option>
        {cities.map((city) => <option key={city.value} value={city.value}>{city.label}</option>)}
      </select>
      <ChevronDown aria-hidden size={16} className="pointer-events-none shrink-0 text-[var(--muted)]"/>
    </div>
    <button type="submit" className="sr-only">Buscar</button>
  </form>;
}
