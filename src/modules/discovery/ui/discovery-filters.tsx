import Link from "next/link";
import { ArrowRight, BookOpen, GraduationCap, LayoutGrid, MapPin, MessageCircle, Music2, Presentation, Sparkles, TheaterIcon, UsersRound } from "lucide-react";
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

export function DiscoveryFilters({ cities, filters }: { cities: Array<{ value: string; label: string }>; filters: Filters }) {
  return <div className="grid gap-5">
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">{categoryPills.map(option => { const Icon = option.icon; return <Link key={option.label} href={buildCategoryUrl(filters, option.value)} className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-bold transition ${filters.category === option.value ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]" : "border-white/10 bg-white/[.035] text-neutral-400 hover:border-white/20 hover:text-white"}`}><Icon aria-hidden size={15}/>{option.label}</Link>; })}</div>
    <div className="grid gap-4">
      <form action="/eventos" className="flex gap-2"><input type="hidden" name="when" value={filters.when}/>{filters.category && <input type="hidden" name="category" value={filters.category}/>}<label className="relative min-w-0 flex-1"><span className="sr-only">Ciudad</span><MapPin aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500" size={17}/><select name="city" defaultValue={filters.city ?? ""} className="field appearance-none !pl-11"><option value="">Todas las ciudades</option>{cities.map(city => <option key={city.value} value={city.value}>{city.label}</option>)}</select></label><button className="btn btn-secondary aspect-square px-0" aria-label="Aplicar ciudad"><ArrowRight aria-hidden size={18}/></button></form>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">{whenOptions.map(option => <Link key={option.value} href={buildFilterUrl(filters, option.value)} className={`shrink-0 rounded-full border px-4 py-2.5 text-sm font-bold transition ${filters.when === option.value ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]" : "border-white/10 bg-white/[.035] text-neutral-400 hover:border-white/20 hover:text-white"}`}>{option.label}</Link>)}</div>
    </div>
  </div>;
}

function buildFilterUrl(filters: Filters, when: DiscoveryWhen) {
  const params = new URLSearchParams();
  if (filters.city) params.set("city", filters.city);
  if (filters.category) params.set("category", filters.category);
  if (when !== "all") params.set("when", when);
  const query = params.toString();
  return query ? `/eventos?${query}` as const : "/eventos" as const;
}

function buildCategoryUrl(filters: Filters, category: Filters["category"]) {
  const params = new URLSearchParams();
  if (filters.city) params.set("city", filters.city);
  if (filters.when !== "all") params.set("when", filters.when);
  if (category) params.set("category", category);
  const query = params.toString();
  return query ? `/eventos?${query}` as const : "/eventos" as const;
}
