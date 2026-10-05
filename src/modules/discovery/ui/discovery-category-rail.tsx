import Link from "next/link";
import { BookOpen, GraduationCap, LayoutGrid, MessageCircle, Music2, Presentation, Sparkles, TheaterIcon, UsersRound } from "lucide-react";
import { EVENT_DISCOVERY_CATEGORY_OPTIONS, type EventDiscoveryCategory } from "@/modules/events/domain/event-profile";
import { EventCover } from "@/modules/events/ui/event-cover";
import type { DiscoveryFilters } from "../domain/discovery";
import { buildFilterUrl } from "../domain/discovery-url";

const categoryIcons: Record<EventDiscoveryCategory, typeof Sparkles> = {
  party: Sparkles, concert: Music2, conference: Presentation, talk: MessageCircle,
  seminar: GraduationCap, networking: UsersRound, educational: BookOpen, theater: TheaterIcon,
};

// Fondo oscuro de cada categoría cuando todavía no hay un evento con foto (así el texto blanco siempre se lee).
const tints: Record<string, string> = {
  all: "from-neutral-700 to-neutral-950", party: "from-violet-700 to-neutral-950", concert: "from-rose-700 to-neutral-950",
  conference: "from-sky-700 to-neutral-950", talk: "from-teal-700 to-neutral-950", seminar: "from-amber-700 to-neutral-950",
  networking: "from-emerald-700 to-neutral-950", educational: "from-indigo-700 to-neutral-950", theater: "from-red-800 to-neutral-950",
};

/** Una sola fila deslizable de categorías como tarjetas visuales; el fondo es la foto de un evento real de esa categoría. */
export function DiscoveryCategoryRail({ filters, covers }: { filters: DiscoveryFilters; covers: Partial<Record<EventDiscoveryCategory, string | null>> }) {
  const items: Array<{ value?: EventDiscoveryCategory; label: string; icon: typeof Sparkles; cover: string | null }> = [
    { value: undefined, label: "Todos", icon: LayoutGrid, cover: null },
    ...EVENT_DISCOVERY_CATEGORY_OPTIONS.map((option) => ({ ...option, icon: categoryIcons[option.value], cover: covers[option.value] ?? null })),
  ];
  return <nav aria-label="Categorías" className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
    {items.map((item) => {
      const active = filters.category === item.value;
      const Icon = item.icon;
      return <Link key={item.label} href={buildFilterUrl({ ...filters, category: item.value })} aria-current={active ? "page" : undefined}
        className={`group relative isolate h-[5.75rem] w-36 shrink-0 snap-start overflow-hidden rounded-[.9rem] border transition sm:h-24 sm:w-[9.25rem] ${active ? "border-[var(--accent)] shadow-[0_0_0_2px_var(--accent)]" : "border-[var(--border-strong)] hover:border-[var(--accent)]"}`}>
        {item.cover ? <EventCover src={item.cover} alt="" className="absolute inset-0 -z-10" sizes="160px"/> : <span aria-hidden className={`absolute inset-0 -z-10 bg-gradient-to-br ${tints[item.value ?? "all"]}`}/>}
        <span aria-hidden className={`absolute inset-0 -z-10 transition ${item.cover ? (active ? "bg-black/45" : "bg-black/60 group-hover:bg-black/50") : (active ? "bg-black/0" : "bg-black/25 group-hover:bg-black/10")}`}/>
        <span className="flex h-full flex-col items-center justify-center gap-1.5 !text-white"><Icon aria-hidden size={22}/><span className="text-[13px] font-bold !text-white">{item.label}</span></span>
      </Link>;
    })}
  </nav>;
}
