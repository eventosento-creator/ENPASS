import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, Plus } from "lucide-react";
import { getCurrentOrganization } from "@/modules/organizations/application/queries";
import { createClient } from "@/shared/database/server";
import { EventCard } from "@/modules/events/ui/event-card";
import { EmptyState } from "@/shared/ui/empty-state";

export default async function EventsPage() {
  const org = await getCurrentOrganization(); if (!org) redirect("/app/onboarding");
  const supabase = await createClient(); const [{ data: events }, { data: venues }, { data: holds }] = await Promise.all([supabase.from("events").select("*").eq("organization_id", org.id).order("starts_at", { ascending: false }), supabase.from("venues").select("*").eq("organization_id", org.id), supabase.from("ticket_holds").select("event_id, quantity").eq("organization_id", org.id).eq("status", "active").gt("expires_at", new Date().toISOString())]);
  const venueById = new Map((venues ?? []).map(venue => [venue.id, venue])); const reservations = (holds ?? []).reduce<Record<string, number>>((totals, hold) => ({ ...totals, [hold.event_id]: (totals[hold.event_id] ?? 0) + hold.quantity }), {});
  return <><div className="flex items-end justify-between gap-4"><div><p className="eyebrow">Tus fechas</p><h1 className="page-title mt-2">Eventos</h1><p className="mt-3 text-neutral-500">Creá, publicá y entendé cada noche.</p></div><Link aria-label="Nueva fecha" className="btn btn-primary" href="/app/events/new"><Plus size={18}/><span className="hidden sm:inline">Nueva fecha</span></Link></div>
  {!events?.length ? <div className="mt-8"><EmptyState icon={CalendarDays} title="Tu primera fecha empieza acá" description="Subí el flyer, agregá entradas y publicala en pocos pasos." action={<Link className="btn btn-primary" href="/app/events/new">Crear fecha</Link>}/></div> : <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{events.map(event => <EventCard key={event.id} event={event} venue={venueById.get(event.venue_id)} reserved={reservations[event.id] ?? 0}/>)}</div>}</>;
}
