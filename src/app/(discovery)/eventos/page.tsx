import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarX2 } from "lucide-react";
import { getPublicDiscoveryEvents } from "@/modules/discovery/application/queries";
import { getFavoritedEventIds } from "@/modules/discovery/application/favorites";
import { filterDiscoveryEvents, getDiscoveryCities, parseDiscoveryFilters } from "@/modules/discovery/domain/discovery";
import { DiscoveryFilters } from "@/modules/discovery/ui/discovery-filters";
import { DiscoveryHeroCarousel } from "@/modules/discovery/ui/discovery-hero-carousel";
import { InfiniteEventMarquee } from "@/modules/discovery/ui/infinite-event-marquee";
import { EmptyState } from "@/shared/ui/empty-state";

export const metadata: Metadata = { title: "Eventos", description: "Encontrá tu próxima fecha: fiestas y eventos con entradas disponibles en ENPASS." };

export default async function EventsDiscoveryPage({ searchParams }: { searchParams: Promise<{ city?: string | string[]; when?: string | string[]; category?: string | string[] }> }) {
  const [query, events, favoritedIds] = await Promise.all([searchParams, getPublicDiscoveryEvents(), getFavoritedEventIds()]);
  const filters = parseDiscoveryFilters(query);
  const filtered = filterDiscoveryEvents(events, filters);
  const cities = getDiscoveryCities(events);
  const hasActiveFilters = Boolean(filters.city) || filters.when !== "all" || Boolean(filters.category);
  const showHero = !hasActiveFilters && events.length > 0;
  return <main className="pb-16 pt-6">
    {showHero && <section className="relative left-1/2 w-screen -translate-x-1/2"><DiscoveryHeroCarousel events={events.slice(0, 5)}/></section>}
    <div className="container-shell"><section className={showHero ? "mt-8" : "mt-2"}><DiscoveryFilters cities={cities} filters={filters}/></section><section className="mt-10">{filtered.length ? <>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-4"><div><p className="eyebrow">Próximos eventos</p><h2 className="mt-1.5 text-2xl font-black tracking-[-.02em] sm:text-3xl">No te pierdas lo que se viene</h2></div>{hasActiveFilters && <Link href="/eventos" className="btn btn-secondary shrink-0">Ver todos los eventos<ArrowRight size={16}/></Link>}</div>
    </> : <EmptyState icon={CalendarX2} title="No encontramos eventos con esos filtros" description="Probá cambiar la categoría, la fecha o la ciudad." action={<Link href="/eventos" className="btn btn-secondary">Ver todos los eventos</Link>}/>}</section></div>
    {filtered.length > 0 && <section className="relative left-1/2 mt-2 w-screen -translate-x-1/2"><InfiniteEventMarquee events={filtered} favoritedIds={favoritedIds}/></section>}
  </main>;
}
