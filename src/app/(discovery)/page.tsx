import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import { getPublicDiscoveryEvents } from "@/modules/discovery/application/queries";
import { filterDiscoveryEvents, getDiscoveryCities } from "@/modules/discovery/domain/discovery";
import { PublicEventGrid } from "@/modules/discovery/ui/public-event-card";

export const metadata: Metadata = {
  title: { absolute: "Nightlife OS — Eventos y entradas" },
  description: "Descubrí fiestas y eventos cerca tuyo. Comprá entradas o publicá tu propia fecha en Nightlife OS.",
};

export default async function DiscoveryHomePage() {
  const events = await getPublicDiscoveryEvents();
  const cities = getDiscoveryCities(events);
  const weekend = filterDiscoveryEvents(events, { when: "weekend" });
  const featured = (weekend.length ? weekend : events).slice(0, 4);
  const featuredIds = new Set(featured.map(event => event.id));
  const upcoming = events.filter(event => !featuredIds.has(event.id)).slice(0, 4);
  const mainCity = cities[0];
  return <main><section className="container-shell pb-8 pt-8 sm:pb-10 sm:pt-12"><div className="max-w-2xl"><p className="eyebrow">Mendoza sale de noche</p><h1 className="mt-3 text-4xl font-black leading-[.98] tracking-[-.05em] sm:text-6xl">¿Qué hacemos hoy?</h1><p className="mt-4 text-lg text-neutral-400 sm:text-xl">Encontrá tu próxima fecha. Entradas sin vueltas.</p></div><div className="mt-7 flex flex-wrap gap-2"><Link href={mainCity ? `/eventos?city=${mainCity.value}` : "/eventos"} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-white/[.04] px-4 text-sm font-bold text-neutral-300"><MapPin aria-hidden size={16}/>{mainCity?.label ?? "Todas las ciudades"}</Link><Link href="/eventos?when=weekend" className="inline-flex min-h-11 items-center rounded-full border border-white/10 bg-white/[.04] px-4 text-sm font-bold text-neutral-300">Este finde</Link></div></section><section className="container-shell pb-14"><div className="mb-5 flex items-end justify-between"><div><p className="eyebrow">{weekend.length ? "Este finde" : "Próximas fechas"}</p><h2 className="mt-2 text-2xl font-black tracking-[-.03em]">La noche empieza acá</h2></div><Link href="/eventos" className="hidden items-center gap-1 text-sm font-bold text-neutral-500 hover:text-white sm:flex">Ver todos <ArrowRight aria-hidden size={15}/></Link></div><PublicEventGrid events={featured} priorityCount={2}/><div className="mt-8 sm:hidden"><Link href="/eventos" className="btn btn-secondary w-full">Ver todos los eventos <ArrowRight aria-hidden size={16}/></Link></div></section>{upcoming.length > 0 ? <section className="container-shell border-t border-white/[.07] py-14"><div className="mb-6 flex items-center justify-between"><h2 className="text-2xl font-black tracking-[-.03em]">Próximamente</h2><Link href="/eventos" className="text-sm font-bold text-neutral-500 hover:text-white">Ver todos</Link></div><PublicEventGrid events={upcoming}/></section> : null}<section className="container-shell pb-16 pt-4"><div className="border-t border-white/[.07] py-10 sm:flex sm:items-center sm:justify-between sm:gap-8"><div className="max-w-xl"><p className="text-xs font-black uppercase tracking-[.14em] text-neutral-600">Para productores</p><h2 className="mt-3 text-2xl font-black tracking-[-.03em]">Publicá tu fecha y administrá la noche.</h2><p className="mt-3 text-sm leading-6 text-neutral-500">Eventos, preventas, pagos y accesos en un solo lugar.</p></div><Link href="/crear-evento/iniciar" className="btn btn-secondary mt-6 shrink-0 sm:mt-0">Conocer la plataforma <ArrowRight aria-hidden size={17}/></Link></div></section></main>;
}
