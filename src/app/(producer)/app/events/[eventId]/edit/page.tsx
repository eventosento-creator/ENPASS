import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/shared/database/server";
import { EventEditForm, EventFunctionsForm } from "@/modules/events/ui/forms";

export default async function EditEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("*").eq("id", eventId).single();
  if (!event) notFound();
  if (["finished", "cancelled"].includes(event.status)) notFound();

  const [{ data: venues }, { data: currentVenue }, { count: ticketCount }, { count: promoterCount }, { count: tableCount }, { count: seatSectionCount }, { count: gateCount }, { count: posCount }] = await Promise.all([
    supabase.from("venues").select("*").eq("organization_id", event.organization_id).order("name"),
    supabase.from("venues").select("timezone").eq("id", event.venue_id).single(),
    supabase.from("ticket_types").select("id", { count: "exact", head: true }).eq("event_id", event.id),
    supabase.from("event_promoters").select("id", { count: "exact", head: true }).eq("event_id", event.id),
    supabase.from("event_tables").select("id", { count: "exact", head: true }).eq("event_id", event.id),
    supabase.from("seat_map_sections").select("id", { count: "exact", head: true }).eq("event_id", event.id),
    supabase.from("access_gates").select("id", { count: "exact", head: true }).eq("event_id", event.id),
    supabase.from("pos_sessions").select("id", { count: "exact", head: true }).eq("event_id", event.id),
  ]);
  if (!venues?.length || !currentVenue) notFound();

  return <section className="mx-auto max-w-2xl">
    <Link href={`/app/events/${event.id}`} className="inline-flex min-h-11 items-center gap-1 text-sm text-neutral-500 hover:text-white"><ChevronLeft size={17}/>Volver al evento</Link>
    <p className="eyebrow mt-8">Configuración</p>
    <h1 className="page-title mt-3">Editar evento</h1>
    <p className="mt-3 text-neutral-500">Actualizá la información que ven compradores y equipo de acceso.</p>
    <EventEditForm event={event} venues={venues} timezone={currentVenue.timezone}/>
    <div id="funciones" className="scroll-mt-6 pt-12"><p className="eyebrow">Experiencia</p><h2 className="section-title mt-2">Funciones del evento</h2><EventFunctionsForm event={event} hasData={{ tickets: Boolean(ticketCount), promoters: Boolean(promoterCount), tables: Boolean(tableCount), seatmap: Boolean(seatSectionCount), access: Boolean(gateCount), pos: Boolean(posCount) }}/></div>
  </section>;
}
