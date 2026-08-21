import type { Metadata } from "next";
import Link from "next/link";
import { CalendarX2 } from "lucide-react";
import { getPublicDiscoveryEvents } from "@/modules/discovery/application/queries";
import { filterDiscoveryEvents, getDiscoveryCities, parseDiscoveryFilters } from "@/modules/discovery/domain/discovery";
import { DiscoveryFilters } from "@/modules/discovery/ui/discovery-filters";
import { PublicEventGrid } from "@/modules/discovery/ui/public-event-card";
import { EmptyState } from "@/shared/ui/empty-state";

export const metadata: Metadata = { title: "Eventos", description: "Encontrá tu próxima fecha: fiestas y eventos con entradas disponibles en Nightlife OS." };

export default async function EventsDiscoveryPage({ searchParams }: { searchParams: Promise<{ city?: string | string[]; when?: string | string[] }> }) {
  const [query, events] = await Promise.all([searchParams, getPublicDiscoveryEvents()]);
  const filters = parseDiscoveryFilters(query);
  const filtered = filterDiscoveryEvents(events, filters);
  const cities = getDiscoveryCities(events);
  return <main className="container-shell pb-16 pt-9 sm:pt-14"><header className="max-w-2xl"><p className="eyebrow">Próximas fechas</p><h1 className="mt-3 text-4xl font-black tracking-[-.05em] sm:text-6xl">Eventos</h1><p className="mt-4 text-lg text-neutral-400">Encontrá tu próxima fecha.</p></header><section className="mt-8 max-w-2xl"><DiscoveryFilters cities={cities} filters={filters}/></section><section className="mt-10">{filtered.length ? <><p className="mb-5 text-sm text-neutral-500">{filtered.length} {filtered.length === 1 ? "evento" : "eventos"}</p><PublicEventGrid events={filtered} priorityCount={2}/></> : <EmptyState icon={CalendarX2} title="No encontramos eventos con esos filtros" description="Probá cambiar la fecha o la ciudad." action={<Link href="/eventos" className="btn btn-secondary">Ver todos los eventos</Link>}/>}</section></main>;
}
