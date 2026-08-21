import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import type { DiscoveryFilters as Filters, DiscoveryWhen } from "../domain/discovery";

const whenOptions: Array<{ value: DiscoveryWhen; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "today", label: "Hoy" },
  { value: "tomorrow", label: "Mañana" },
  { value: "weekend", label: "Este finde" },
];

export function DiscoveryFilters({ cities, filters }: { cities: Array<{ value: string; label: string }>; filters: Filters }) {
  return <div className="grid gap-4"><form action="/eventos" className="flex gap-2"><input type="hidden" name="when" value={filters.when}/><label className="relative min-w-0 flex-1"><span className="sr-only">Ciudad</span><MapPin aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500" size={17}/><select name="city" defaultValue={filters.city ?? ""} className="field appearance-none !pl-11"><option value="">Todas las ciudades</option>{cities.map(city => <option key={city.value} value={city.value}>{city.label}</option>)}</select></label><button className="btn btn-secondary aspect-square px-0" aria-label="Aplicar ciudad"><ArrowRight aria-hidden size={18}/></button></form><div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">{whenOptions.map(option => <Link key={option.value} href={buildFilterUrl(filters.city, option.value)} className={`shrink-0 rounded-full border px-4 py-2.5 text-sm font-bold transition ${filters.when === option.value ? "border-[var(--accent)] bg-[var(--accent)] text-black" : "border-white/10 bg-white/[.035] text-neutral-400 hover:border-white/20 hover:text-white"}`}>{option.label}</Link>)}</div></div>;
}

function buildFilterUrl(city: string | undefined, when: DiscoveryWhen) {
  const params = new URLSearchParams();
  if (city) params.set("city", city);
  if (when !== "all") params.set("when", when);
  const query = params.toString();
  return query ? `/eventos?${query}` as const : "/eventos" as const;
}
