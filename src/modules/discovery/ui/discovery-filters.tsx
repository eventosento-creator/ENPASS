import Link from "next/link";
import { BookOpen, GraduationCap, LayoutGrid, MapPin, MessageCircle, Music2, Presentation, Search, Sparkles, TheaterIcon, UsersRound } from "lucide-react";
import { EVENT_DISCOVERY_CATEGORY_OPTIONS, type EventDiscoveryCategory } from "@/modules/events/domain/event-profile";
import type { DiscoveryFilters as Filters, DiscoveryWhen } from "../domain/discovery";

const whenOptions: Array<{ value: DiscoveryWhen; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "today", label: "Hoy" },
  { value: "tomorrow", label: "Mañana" },
  { value: "weekend", label: "Este finde" },
];

const categoryIcons: Record<EventDiscoveryCategory, typeof Sparkles> = {
  party: Sparkles, concert: Music2, conference: Presentation, talk: MessageCircle,
  seminar: GraduationCap, networking: UsersRound, educational: BookOpen, theater: TheaterIcon,
};

const categoryPills: Array<{ value?: EventDiscoveryCategory; label: string; icon: typeof Sparkles }> = [
  { value: undefined, label: "Todos", icon: LayoutGrid },
  ...EVENT_DISCOVERY_CATEGORY_OPTIONS.map((option) => ({ ...option, icon: categoryIcons[option.value] })),
];

const pillClass = (active: boolean) => `inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-bold transition ${active ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]" : "border-white/10 bg-white/[.035] text-neutral-400 hover:border-white/20 hover:text-white"}`;

export function DiscoveryFilters({ cities, filters }: { cities: Array<{ value: string; label: string }>; filters: Filters }) {
  return <div className="grid gap-5">
    <form action="/eventos" className="flex gap-2"><input type="hidden" name="when" value={filters.when}/>{filters.category && <input type="hidden" name="category" value={filters.category}/>}{filters.city && <input type="hidden" name="city" value={filters.city}/>}<label className="relative min-w-0 flex-1"><span className="sr-only">Buscar eventos</span><Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500" size={17}/><input type="search" name="q" defaultValue={filters.q ?? ""} placeholder="Buscar por nombre, lugar o ciudad" className="field !pl-11"/></label><button type="submit" className="btn btn-secondary aspect-square px-0" aria-label="Buscar"><Search aria-hidden size={18}/></button></form>
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">{categoryPills.map(option => { const Icon = option.icon; return <Link key={option.label} href={buildFilterUrl(filters, { category: option.value })} className={pillClass(filters.category === option.value)}><Icon aria-hidden size={15}/>{option.label}</Link>; })}</div>
    {cities.length > 1 && <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      <Link href={buildFilterUrl(filters, { city: undefined })} className={pillClass(!filters.city)}><MapPin aria-hidden size={15}/>Todas las ciudades</Link>
      {cities.map(city => <Link key={city.value} href={buildFilterUrl(filters, { city: city.value })} className={pillClass(filters.city === city.value)}>{city.label}</Link>)}
    </div>}
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">{whenOptions.map(option => <Link key={option.value} href={buildFilterUrl(filters, { when: option.value })} className={pillClass(filters.when === option.value)}>{option.label}</Link>)}</div>
  </div>;
}

function buildFilterUrl(filters: Filters, overrides: { city?: string; when?: DiscoveryWhen; category?: EventDiscoveryCategory }) {
  const next = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (next.city) params.set("city", next.city);
  if (next.category) params.set("category", next.category);
  if (next.q) params.set("q", next.q);
  if (next.when !== "all") params.set("when", next.when);
  const query = params.toString();
  return query ? `/eventos?${query}` as const : "/eventos" as const;
}
