import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, ChevronLeft, MapPin } from "lucide-react";
import { createClient } from "@/shared/database/server";
import { EventCover } from "@/modules/events/ui/event-cover";
import { LinkTicketBuy } from "@/modules/orders/ui/link-ticket-buy";
import { formatEventDate } from "@/shared/lib/format";
import { EnpassLogo } from "@/shared/ui/brand";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Entrada · ENPASS", robots: { index: false, follow: false } };

const opensAtFormat = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

export default async function LinkTicketPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const supabase = await createClient();
  const { data: eventRows } = await supabase.rpc("get_public_event_by_slug", { target_slug: slug });
  const event = eventRows?.[0];
  if (!event) notFound();
  const [{ data: ticketRows }, { data: venue }] = await Promise.all([
    supabase.rpc("get_link_ticket_type", { target_event: event.id, target_token: token }),
    supabase.from("venues").select("*").eq("id", event.venue_id).maybeSingle(),
  ]);
  const ticket = ticketRows?.[0];
  if (!ticket) notFound();

  return <main className="container-shell min-h-screen py-6 sm:py-10"><section className="mx-auto w-full max-w-2xl">
    <header className="mb-6 flex items-center justify-between"><Link href={`/e/${slug}` as never} className="inline-flex min-h-11 items-center gap-1 text-sm text-neutral-500 hover:text-white"><ChevronLeft size={17}/>Ver evento</Link><Link href="/"><EnpassLogo/></Link></header>
    <div className="card overflow-hidden">
      <EventCover src={event.cover_image_url} alt={`Flyer de ${event.name}`} className="aspect-[16/8]" priority sizes="(max-width: 768px) 100vw, 672px"/>
      <div className="p-5 sm:p-8">
        <p className="eyebrow">Entrada especial</p>
        <h1 className="mt-2 text-3xl font-black tracking-[-.04em] sm:text-4xl">{event.name}</h1>
        <div className="mt-4 grid gap-2 text-sm text-neutral-400">
          <p className="flex items-center gap-2"><CalendarDays size={16}/>{formatEventDate(event.starts_at, venue?.timezone ?? "America/Argentina/Mendoza")}</p>
          {venue && <p className="flex items-center gap-2"><MapPin size={16}/>{venue.name} · {venue.city}</p>}
        </div>
        {ticket.sale_state === "upcoming" && ticket.sales_start && <p className="mt-5 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/[.06] p-4 text-sm font-bold">Se habilita el {opensAtFormat.format(new Date(ticket.sales_start))} (hora de Argentina).</p>}
        {ticket.description && <p className="mt-4 text-sm leading-6 text-neutral-500">{ticket.description}</p>}
        <LinkTicketBuy slug={slug} ticketId={ticket.id} token={token} name={ticket.name} priceAmount={ticket.price_amount} currency={ticket.currency} maxQuantity={Math.max(1, Math.min(ticket.max_per_order, ticket.available_quantity))} salesStart={ticket.sales_start} state={ticket.sale_state}/>
      </div>
    </div>
  </section></main>;
}
