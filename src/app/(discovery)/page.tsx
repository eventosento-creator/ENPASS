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
  return <main><section className="container-shell pb-9 pt-9 sm:pb-12 sm:pt-14"><div className="max-w-2xl"><p className="eyebrow">Mendoza sale de noche</p><h1 className="mt-3 text-4xl font-black leading-[.98] tracking-[-.05em] sm:text-6xl">¿Qué hacemos hoy?</h1><p className="mt-4 text-lg text-neutral-400 sm:text-xl">Fiestas, fechas y eventos cerca tuyo.</p></div><div className="mt-7 flex flex-wrap gap-2"><Link href={mainCity ? `/eventos?city=${mainCity.value}` : "/eventos"} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-white/[.04] px-4 text-sm font-bold text-neutral-300"><MapPin aria-hidden size={16}/>{mainCity?.label ?? "Todas las ciudades"}</Link><Link href="/eventos?when=weekend" className="inline-flex min-h-11 items-center rounded-full border border-white/10 bg-white/[.04] px-4 text-sm font-bold text-neutral-300">Este finde</Link></div></section><section className="container-shell pb-14"><div className="mb-5 flex items-end justify-between"><div><p className="eyebrow">{weekend.length ? "Este finde" : "Próximas fechas"}</p><h2 className="mt-2 text-2xl font-black tracking-[-.03em]">La noche empieza acá</h2></div><Link href="/eventos" className="hidden items-center gap-1 text-sm font-bold text-neutral-500 hover:text-white sm:flex">Ver todos <ArrowRight aria-hidden size={15}/></Link></div><PublicEventGrid events={featured} priorityCount={2}/><div className="mt-8 sm:hidden"><Link href="/eventos" className="btn btn-secondary w-full">Ver todos los eventos <ArrowRight aria-hidden size={16}/></Link></div></section>{upcoming.length > 0 ? <section className="container-shell border-t border-white/[.07] py-14"><div className="mb-6 flex items-center justify-between"><h2 className="text-2xl font-black tracking-[-.03em]">Próximamente</h2><Link href="/eventos" className="text-sm font-bold text-neutral-500 hover:text-white">Ver todos</Link></div><PublicEventGrid events={upcoming}/></section> : null}<section className="container-shell pb-16 pt-4"><div className="relative overflow-hidden rounded-[1.7rem] border border-white/[.08] bg-[#141416] p-7 sm:p-10"><div aria-hidden className="absolute -right-12 -top-20 size-72 rounded-full bg-lime-300/10 blur-3xl"/><div className="relative max-w-xl"><p className="eyebrow">¿Organizás eventos?</p><h2 className="mt-3 text-3xl font-black leading-tight tracking-[-.04em] sm:text-4xl">Publicá tu fecha y empezá a vender.</h2><p className="mt-4 leading-7 text-neutral-400">Creá el evento, ordená tus preventas y administrá la noche desde un solo lugar.</p><Link href="/crear-evento/iniciar" className="btn btn-primary mt-7">Crear mi evento <ArrowRight aria-hidden size={17}/></Link></div></div></section></main>;
}
