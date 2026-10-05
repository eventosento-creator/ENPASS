import Link from "next/link";
import { X } from "lucide-react";
import type { DiscoveryFilters } from "../domain/discovery";
import { buildFilterUrl, priceLabels, whenLabels } from "../domain/discovery-url";

/** Solo los filtros que están aplicados, cada uno con su × para sacarlo. No se muestra nada si no hay ninguno. */
export function DiscoveryActiveFilters({ filters, cities }: { filters: DiscoveryFilters; cities: Array<{ value: string; label: string }> }) {
  const chips: Array<{ label: string; href: ReturnType<typeof buildFilterUrl> }> = [];
  if (filters.when !== "all") chips.push({ label: whenLabels[filters.when], href: buildFilterUrl(filters, {}, ["when"]) });
  if (filters.city) chips.push({ label: cities.find((city) => city.value === filters.city)?.label ?? filters.city, href: buildFilterUrl(filters, {}, ["city"]) });
  if (filters.price) chips.push({ label: priceLabels[filters.price], href: buildFilterUrl(filters, {}, ["price"]) });
  if (filters.q) chips.push({ label: `“${filters.q}”`, href: buildFilterUrl(filters, {}, ["q"]) });
  if (!chips.length) return null;
  return <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Filtros aplicados">
    {chips.map((chip) => <Link key={chip.label} href={chip.href} aria-label={`Quitar filtro ${chip.label}`} className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-[var(--border-strong)] bg-[var(--surface)] pl-3.5 pr-2.5 text-xs font-bold transition hover:border-[var(--accent)]">{chip.label}<X aria-hidden size={13}/></Link>)}
  </div>;
}
