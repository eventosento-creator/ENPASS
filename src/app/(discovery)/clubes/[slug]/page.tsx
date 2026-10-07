import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowRight, CalendarDays, MapPin, Trophy, Users2 } from "lucide-react";
import { getMemberProfile } from "@/modules/clubs/application/member-portal";
import { MemberHub } from "@/modules/clubs/ui/member-hub";
import { getClubUpcomingEventIds, getPublicClubCategories, getPublicClubDivisions, getPublicClubProfile } from "@/modules/clubs/application/public-queries";
import { resolveClubBrand } from "@/modules/clubs/domain/brand";
import { MembershipRequestForm } from "@/modules/clubs/ui/membership-request-form";
import { getPublicDiscoveryEvents } from "@/modules/discovery/application/queries";
import { PublicEventCard } from "@/modules/discovery/ui/public-event-card";
import { formatMoney } from "@/shared/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const club = await getPublicClubProfile(slug);
  if (!club) return { title: "Club" };
  return { title: club.name, description: club.description ?? `Sumate como socio de ${club.name}.` };
}

export default async function ClubProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const club = await getPublicClubProfile(slug);
  if (!club) notFound();
  const [categories, divisions, eventIds, allEvents] = await Promise.all([getPublicClubCategories(club.organizationId), getPublicClubDivisions(club.organizationId), getClubUpcomingEventIds(club.organizationId), getPublicDiscoveryEvents()]);
  const memberProfile = await getMemberProfile(slug);
  const idSet = new Set(eventIds);
  const events = allEvents.filter((event) => idSet.has(event.id)).slice(0, 8);
  const brand = resolveClubBrand(club.accentColor);
  const cheapest = categories.length ? Math.min(...categories.map((category) => category.monthlyFeeAmount)) : null;
  // El color del club pisa el acento solo dentro de esta página (botones y detalles); el resto del sitio no cambia.
  const heroText = club.coverUrl ? "#ffffff" : brand?.onAccent;
  const brandVars = brand ? { "--accent": brand.accent, "--on-accent": brand.onAccent } as CSSProperties : undefined;

  return <main className="container-shell pb-20 pt-6 sm:pt-8" style={brandVars}>
    <section className="relative overflow-hidden rounded-[1.75rem] px-6 py-10 sm:px-12 sm:py-14" style={brand ? { background: brand.gradient, color: heroText } : undefined}>
      {club.coverUrl && <>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={club.coverUrl} alt="" className="absolute inset-0 size-full object-cover" style={{ objectPosition: `${club.coverFocus.x}% ${club.coverFocus.y}%` }}/><div aria-hidden className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/60 to-black/25"/></>}
      {!brand && !club.coverUrl && <div aria-hidden className="absolute inset-0 -z-10 bg-[var(--surface)]"/>}
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-white/10 blur-2xl"/>
      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-8">
        {club.logoUrl ? <img src={club.logoUrl} alt={`Logo de ${club.name}`} className="size-24 shrink-0 rounded-3xl bg-white object-contain p-3 shadow-[var(--shadow-md)] sm:size-32"/> : <div className="grid size-24 shrink-0 place-items-center rounded-3xl sm:size-32" style={{ background: "rgba(255,255,255,.15)" }}><Users2 size={40}/></div>}
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[.18em] opacity-70">Club</p>
          <h1 className="mt-2 text-4xl font-black leading-[1.05] tracking-[-.02em] sm:text-5xl" style={heroText ? { color: heroText } : undefined}>{club.name}</h1>
          {club.description && <p className="mt-3 max-w-2xl leading-7 opacity-85" style={heroText ? { color: heroText } : undefined}>{club.description}</p>}
          {(club.location || club.activity) && <p className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm opacity-85">{club.location && <span className="inline-flex items-center gap-1.5"><MapPin aria-hidden size={15}/>{club.location}</span>}{club.activity && <span className="inline-flex items-center gap-1.5"><Trophy aria-hidden size={15}/>{club.activity}</span>}</p>}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <a href={memberProfile ? "#mi-cuota" : "#asociarme"} className="inline-flex min-h-12 items-center gap-2 rounded-full px-6 text-sm font-black transition hover:opacity-90" style={club.coverUrl ? { background: "#ffffff", color: "#0a0a0b" } : brand ? { background: brand.onAccent, color: brand.accent } : { background: "var(--accent)", color: "var(--on-accent)" }}>{memberProfile ? "Ver mi cuota" : "Quiero ser socio"}<ArrowRight aria-hidden size={16}/></a>
            {!memberProfile && <Link href={`/mi-club/${club.slug}` as never} className="inline-flex min-h-12 items-center text-sm font-bold underline-offset-4 hover:underline" style={heroText ? { color: heroText } : undefined}>Ya soy socio</Link>}
          </div>
        </div>
      </div>
      <dl className="relative mt-8 flex flex-wrap gap-x-8 gap-y-3 text-sm" style={heroText ? { color: heroText } : undefined}>
        {categories.length > 0 && <div><dt className="opacity-70">Categorías</dt><dd className="text-lg font-black">{categories.length}</dd></div>}
        {cheapest !== null && <div><dt className="opacity-70">Cuota desde</dt><dd className="text-lg font-black">{formatMoney(cheapest, club.currency)}<span className="text-sm font-semibold opacity-70">/mes</span></dd></div>}
        {events.length > 0 && <div><dt className="opacity-70">Próximos eventos</dt><dd className="text-lg font-black">{events.length}</dd></div>}
      </dl>
    </section>

    {memberProfile && <div className="mt-8 max-w-2xl"><MemberHub slug={club.slug}/></div>}

    {events.length > 0 && <section className="mt-12" aria-label={`Próximos eventos de ${club.name}`}>
      <h2 className="flex items-center gap-2 text-2xl font-black tracking-[-.02em]"><CalendarDays aria-hidden size={22} className="text-[var(--accent)]"/>Próximos eventos</h2>
      <div className="no-scrollbar -mx-4 mt-5 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-4">
        {events.map((event) => <div key={event.id} className="flex w-[68%] shrink-0 snap-start sm:w-auto [&>*]:w-full"><PublicEventCard event={event}/></div>)}
      </div>
    </section>}

    {categories.length > 0 && <section className="mt-12">
      <h2 className="text-2xl font-black tracking-[-.02em]">Categorías de socio</h2>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((category) => <div key={category.id} className="card flex items-center justify-between gap-4 border-l-4 p-5" style={brand ? { borderLeftColor: brand.accent } : undefined}><span className="font-bold">{category.name}</span><span className="text-right"><span className="text-lg font-black">{formatMoney(category.monthlyFeeAmount, club.currency)}</span><span className="text-sm text-neutral-500">/mes</span></span></div>)}
      </div>
    </section>}

    {divisions.length > 0 && <section className="mt-12">
      <h2 className="text-2xl font-black tracking-[-.02em]">Divisiones</h2>
      <p className="mt-1 text-sm text-neutral-500">Actividades y equipos del club. Algunas tienen una cuota propia, adicional a la de socio.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {divisions.map((division) => <div key={division.id} className="card flex items-center justify-between gap-4 border-l-4 p-5" style={brand ? { borderLeftColor: brand.accent } : undefined}><span className="font-bold">{division.name}</span>{division.monthlyFeeAmount > 0 && <span className="text-right"><span className="text-lg font-black">{formatMoney(division.monthlyFeeAmount, club.currency)}</span><span className="text-sm text-neutral-500">/mes</span></span>}</div>)}
      </div>
    </section>}

    {!memberProfile && <section id="asociarme" className="card mt-12 max-w-xl scroll-mt-24 p-5 sm:p-7">
      <h2 className="text-xl font-black">Quiero ser socio</h2>
      <p className="mt-1 text-sm text-neutral-500">Completá tus datos. {club.name} revisa tu solicitud y te contacta.</p>
      {categories.length > 0 ? <MembershipRequestForm organizationId={club.organizationId} categories={categories}/> : <p className="mt-4 text-sm text-neutral-500">Este club todavía no tiene categorías abiertas.</p>}
    </section>}
  </main>;
}
