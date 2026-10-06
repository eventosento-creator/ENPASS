import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { ArrowRight, CalendarX2 } from "lucide-react";
import { getPublicDiscoveryEvents } from "@/modules/discovery/application/queries";
import { getFavoritedEventIds } from "@/modules/discovery/application/favorites";
import { filterDiscoveryEvents, getDiscoveryCities, LOCATION_COOKIE, parseDiscoveryFilters, parseLocationCookie, sortByProximity, type NearbyDiscoveryEvent } from "@/modules/discovery/domain/discovery";
import { DiscoveryActiveFilters } from "@/modules/discovery/ui/discovery-active-filters";
import { DiscoveryCategoryRail } from "@/modules/discovery/ui/discovery-category-rail";
import { DiscoveryFilterMenu } from "@/modules/discovery/ui/discovery-filter-menu";
import { DiscoveryHeroCarousel } from "@/modules/discovery/ui/discovery-hero-carousel";
import { DiscoverySearchBar } from "@/modules/discovery/ui/discovery-search-bar";
import { PublicEventCard } from "@/modules/discovery/ui/public-event-card";
import type { EventDiscoveryCategory } from "@/modules/events/domain/event-profile";
import { EmptyState } from "@/shared/ui/empty-state";

export const metadata: Metadata = { title: "Eventos", description: "Encontrá tu próxima fecha: fiestas y eventos con entradas disponibles en ENPASS." };

export default async function EventsDiscoveryPage({ searchParams }: { searchParams: Promise<{ city?: string | string[]; when?: string | string[]; category?: string | string[]; q?: string | string[]; price?: string | string[] }> }) {
  const [query, events, favoritedIds] = await Promise.all([searchParams, getPublicDiscoveryEvents(), getFavoritedEventIds()]);
  const filters = parseDiscoveryFilters(query);
  const location = parseLocationCookie((await cookies()).get(LOCATION_COOKIE)?.value);
  const dated = filterDiscoveryEvents(events, filters);
  // Con ubicación: del más cercano al más lejano. Sin ella, por fecha como siempre.
  const filtered: NearbyDiscoveryEvent[] = location ? sortByProximity(dated, location) : dated.map((event) => ({ ...event, distanceKm: null }));
  const cities = getDiscoveryCities(events);
  const favorited = new Set(favoritedIds);
  const hasActiveFilters = Boolean(filters.city) || filters.when !== "all" || Boolean(filters.category) || Boolean(filters.q) || Boolean(filters.price);
  const showHero = !hasActiveFilters && events.length > 0;
  // Foto de cada categoría: la de su próximo evento con imagen (si no hay, la tarjeta usa el fondo de ENPASS).
  const covers: Partial<Record<EventDiscoveryCategory, string | null>> = {};
  for (const event of events) if (event.cover_image_url && !covers[event.discovery_category]) covers[event.discovery_category] = event.cover_image_url;

  return <main className="mx-auto w-full max-w-[1440px] px-4 pb-20 pt-4 sm:px-6 sm:pt-6 lg:px-10">
    {showHero && <section aria-label="Eventos destacados"><DiscoveryHeroCarousel events={events.slice(0, 5)}/></section>}

    <section className={showHero ? "mt-6" : "mt-2"} aria-label="Buscar eventos">
      <div className="flex flex-col gap-3 sm:flex-row">
        <DiscoverySearchBar cities={cities} filters={filters}/>
        <DiscoveryFilterMenu filters={filters}/>
      </div>
      <DiscoveryActiveFilters filters={filters} cities={cities}/>
      <div className="mt-5"><DiscoveryCategoryRail filters={filters} covers={covers}/></div>
    </section>

    <section className="mt-10 sm:mt-12" aria-label="Próximos eventos">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div><h2 className="text-2xl font-black tracking-[-.02em] sm:text-3xl">Próximos eventos</h2><p className="mt-1 text-sm text-[var(--muted)]">{location ? "Ordenados por cercanía a tu ubicación" : "Los próximos eventos en ENPASS"}</p></div>
        <Link href="/eventos" className="inline-flex shrink-0 items-center gap-1.5 text-sm font-bold hover:gap-2.5">Ver todos<ArrowRight aria-hidden size={16}/></Link>
      </div>
      {filtered.length ? <div className="no-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-4 xl:grid-cols-5">
        {filtered.map((event, index) => <div key={event.id} className="flex w-[68%] shrink-0 snap-start sm:w-auto [&>*]:w-full"><PublicEventCard event={event} priority={index < 4} favorited={favorited.has(event.id)} distanceKm={event.distanceKm}/></div>)}
      </div> : <EmptyState icon={CalendarX2} title="No encontramos eventos con esos filtros" description="Probá cambiar la búsqueda, la categoría, la fecha o la ciudad." action={<Link href="/eventos" className="btn btn-secondary">Ver todos los eventos</Link>}/>}
    </section>
  </main>;
}
