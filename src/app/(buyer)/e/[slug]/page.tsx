import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { CalendarDays, MapPin } from "lucide-react";
import { createClient } from "@/shared/database/server";
import { TicketSelector } from "@/modules/orders/ui/ticket-selector";
import { EventCover } from "@/modules/events/ui/event-cover";
import { formatEventDate } from "@/shared/lib/format";

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
  const { data: types } = await supabase.rpc("get_public_ticket_types", { target_event: event.id });
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
  return <main className="min-h-screen pb-10"><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}/><header className="container-shell flex items-center justify-between py-5"><span className="text-sm font-black tracking-[-.03em]">NIGHTLIFE OS</span><span className="text-[10px] font-bold uppercase tracking-[.15em] text-neutral-600">Entradas</span></header><div className="container-shell grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-10"><section><EventCover src={event.cover_image_url} alt={`Flyer de ${event.name}`} className="aspect-[4/5] rounded-[1.4rem] sm:aspect-[16/10] lg:aspect-[4/3]" priority sizes="(max-width: 1024px) 100vw, 62vw"/><div className="px-1 py-7 sm:px-2 sm:py-9"><p className="eyebrow">{venue.city}</p><h1 className="mt-3 text-4xl font-black tracking-[-.05em] sm:text-6xl">{event.name}</h1><div className="mt-6 grid gap-5 text-neutral-300"><div className="flex items-start gap-3"><CalendarDays className="mt-0.5 text-neutral-600" size={19}/><p className="font-semibold">{formatEventDate(event.starts_at, venue.timezone)}</p></div><div className="flex items-start gap-3"><MapPin className="mt-0.5 text-neutral-600" size={19}/><div><p className="font-semibold">{venue.name}</p><p className="mt-1 text-sm text-neutral-500">{venue.address}, {venue.city}</p></div></div></div>{event.description && <p className="mt-8 max-w-2xl border-t border-white/[.07] pt-7 leading-7 text-neutral-400">{event.description}</p>}</div></section><aside className="lg:sticky lg:top-6"><div className="card p-4 sm:p-5"><h2 className="mb-1 text-xl font-black">Elegí tus entradas</h2><p className="mb-5 text-sm text-neutral-500">Seleccioná la cantidad que necesitás.</p>{types?.length ? <TicketSelector eventSlug={event.slug} ticketTypes={types}/> : <p className="rounded-xl bg-neutral-900 p-5 text-neutral-400">No hay entradas disponibles.</p>}</div><p className="mt-4 text-center text-[11px] text-neutral-700">Compra segura · No necesitás crear una cuenta</p></aside></div></main>;
}

function absoluteUrl(path: string) {
  try { return new URL(path).toString(); }
  catch { return new URL(path, process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").toString(); }
}
