import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CalendarDays, ChevronLeft, MapPin, ShieldCheck, UserRoundCheck } from "lucide-react";
import { createClient } from "@/shared/database/server";
import { TicketSelector } from "@/modules/orders/ui/ticket-selector";
import { EventCover } from "@/modules/events/ui/event-cover";
import { formatEventDate } from "@/shared/lib/format";
import { getActivePromoterAttribution } from "@/modules/promoters/application/attribution";
import { getPromoterAttributionSessionHash } from "@/modules/promoters/infrastructure/session";

const publicEventContext = cache(async (slug: string) => {
  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("*").eq("slug", slug).eq("status", "published").maybeSingle();
  if (!event) return null;
  const { data: venue } = await supabase.from("venues").select("*").eq("id", event.venue_id).maybeSingle();
  return venue ? { event, venue } : null;
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const context = await publicEventContext(slug);
  if (!context) return { title: "Evento no encontrado" };
  const { event, venue } = context;
  const eventDetails = `${formatEventDate(event.starts_at, venue.timezone)} en ${venue.name}, ${venue.city}.`;
  const description = event.description ? `${eventDetails} ${event.description}` : eventDetails;
  const image = event.cover_image_url || "/opengraph-image";
  return {
    title: event.name,
    description,
    openGraph: { title: event.name, description, url: `/e/${event.slug}`, images: [{ url: image, alt: `Flyer de ${event.name}` }] },
    twitter: { card: "summary_large_image", title: event.name, description, images: [image] },
  };
}

export default async function PublicEventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const context = await publicEventContext(slug);
  if (!context) notFound();
  const { event, venue } = context;
  const supabase = await createClient();
  const [typesResult, attribution] = await Promise.all([
    supabase.rpc("get_public_ticket_types", { target_event: event.id }),
    getPromoterAttributionSessionHash().then((sessionHash) => getActivePromoterAttribution(event.id, sessionHash)),
  ]);
  const types = typesResult.data;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.name,
    description: event.description,
    startDate: event.starts_at,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    url: absoluteUrl(`/e/${event.slug}`),
    image: event.cover_image_url ? [absoluteUrl(event.cover_image_url)] : undefined,
    location: { "@type": "Place", name: venue.name, address: { "@type": "PostalAddress", streetAddress: venue.address, addressLocality: venue.city, addressRegion: venue.province, addressCountry: "AR" } },
  };
  return <main className="min-h-screen pb-10"><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}/><header className="container-shell flex items-center justify-between py-5"><Link href="/eventos" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-neutral-500 transition hover:text-white"><ChevronLeft size={17}/>Eventos</Link><Link href="/" className="text-sm font-black tracking-[-.03em]">NIGHTLIFE OS</Link></header><div className="container-shell grid items-start gap-7 md:grid-cols-[minmax(0,1fr)_320px] md:gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-12"><section><EventCover src={event.cover_image_url} alt={`Flyer de ${event.name}`} className="aspect-[4/5] max-h-[760px] rounded-[1.4rem]" priority sizes="(max-width: 767px) 100vw, (max-width: 1024px) 55vw, 62vw"/><div className="px-1 py-7 sm:px-2 sm:py-9"><p className="eyebrow">{venue.city}</p><h1 className="mt-3 text-4xl font-black leading-[.98] tracking-[-.05em] sm:text-5xl lg:text-6xl">{event.name}</h1><div className="mt-7 grid gap-5 text-neutral-300 lg:grid-cols-2"><div className="flex items-start gap-3"><CalendarDays className="mt-0.5 text-neutral-600" size={19}/><p className="font-semibold leading-6">{formatEventDate(event.starts_at, venue.timezone)}</p></div><div className="flex items-start gap-3"><MapPin className="mt-0.5 text-neutral-600" size={19}/><div><p className="font-semibold">{venue.name}</p><p className="mt-1 text-sm leading-5 text-neutral-500">{venue.address}, {venue.city}</p></div></div></div>{event.description && <p className="mt-8 max-w-2xl border-t border-white/[.07] pt-7 leading-7 text-neutral-400">{event.description}</p>}</div></section><aside className="md:sticky md:top-6">{attribution && <div className="mb-3 flex items-center gap-2 rounded-xl border border-[var(--accent)]/15 bg-[var(--accent)]/[.05] px-4 py-3 text-xs font-semibold text-neutral-300"><UserRoundCheck size={15} className="text-[var(--accent)]"/>Invitación de {attribution.promoter_display_name}</div>}<div className="surface p-5 sm:p-6"><h2 className="text-2xl font-black tracking-[-.03em]">Elegí tus entradas</h2><p className="mt-2 text-sm text-neutral-500">El total completo se muestra antes de reservar.</p><div className="mt-5">{types?.length ? <TicketSelector eventSlug={event.slug} ticketTypes={types}/> : <div className="py-8 text-center"><p className="font-bold">Sin entradas disponibles</p><p className="mt-2 text-sm text-neutral-500">Volvé a revisar más adelante.</p></div>}</div></div><p className="mt-4 flex items-center justify-center gap-2 text-[11px] font-semibold text-neutral-600"><ShieldCheck size={14}/>Compra segura · Sin crear una cuenta</p></aside></div></main>;
}

function absoluteUrl(path: string) {
  try { return new URL(path).toString(); }
  catch { return new URL(path, process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").toString(); }
}
