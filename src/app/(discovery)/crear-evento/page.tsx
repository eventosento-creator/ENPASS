import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarPlus, ChartNoAxesColumnIncreasing, Ticket } from "lucide-react";
import { EventCover } from "@/modules/events/ui/event-cover";

export const metadata: Metadata = { title: "Crear evento", description: "Creá tu fecha, publicá entradas y administrá la noche con Nightlife OS." };

export default function CreateEventLandingPage() {
  return <main><section className="container-shell grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-[1fr_430px] lg:py-20"><div className="max-w-2xl"><p className="eyebrow">Para productores</p><h1 className="mt-4 text-5xl font-black leading-[.94] tracking-[-.055em] sm:text-7xl">Tu próxima fecha empieza acá.</h1><p className="mt-6 max-w-lg text-lg leading-8 text-neutral-400">Creá el evento. Vendé entradas. Administrá la noche.</p><Link className="btn btn-primary mt-8" href="/crear-evento/iniciar">Crear mi evento <ArrowRight size={17}/></Link></div><div className="card overflow-hidden"><EventCover src="/demo/noche-2000.png" alt="Ejemplo visual de un evento en Nightlife OS" className="aspect-[16/10]" priority sizes="(max-width: 1024px) 100vw, 430px"/><div className="p-5"><p className="eyebrow">Tu próxima fecha</p><h2 className="mt-2 text-2xl font-black">Noche 2000</h2><div className="mt-5 flex items-center justify-between text-sm"><span className="text-neutral-500">Entradas configuradas</span><strong>600</strong></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full w-2/3 rounded-full bg-[var(--accent)]"/></div></div></div></section><section className="border-y border-white/[.07] bg-[#0d0d0e]"><div className="container-shell grid gap-3 py-14 sm:grid-cols-3">{steps.map(step => <article key={step.number} className="rounded-[1.25rem] border border-white/[.07] bg-white/[.025] p-6"><span className="text-xs font-black text-[var(--accent)]">{step.number}</span><step.icon className="mt-8 text-neutral-500" size={22}/><h2 className="mt-4 text-xl font-black">{step.title}</h2><p className="mt-2 text-sm leading-6 text-neutral-500">{step.description}</p></article>)}</div></section><section className="container-shell py-16 text-center"><p className="eyebrow">La noche no espera</p><h2 className="mx-auto mt-3 max-w-2xl text-3xl font-black tracking-[-.04em] sm:text-5xl">Creá tu fecha y empezá a vender.</h2><Link className="btn btn-primary mt-8" href="/crear-evento/iniciar">Crear evento <ArrowRight size={17}/></Link></section></main>;
}

const steps = [
  { number: "01", title: "Publicá tu fecha", description: "Flyer, lugar y horario. Lo esencial, sin formularios eternos.", icon: CalendarPlus },
  { number: "02", title: "Vendé entradas", description: "Organizá preventas y compartí una página lista para comprar.", icon: Ticket },
  { number: "03", title: "Administrá la noche", description: "Entendé reservas y capacidad desde un panel hecho para eventos.", icon: ChartNoAxesColumnIncreasing },
];
