import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/shared/database/server";
import { EventEditForm } from "@/modules/events/ui/forms";

export default async function EditEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("*").eq("id", eventId).single();
  if (!event) notFound();
  if (["finished", "cancelled"].includes(event.status)) notFound();

  const [{ data: venues }, { data: currentVenue }] = await Promise.all([
    supabase.from("venues").select("*").eq("organization_id", event.organization_id).order("name"),
    supabase.from("venues").select("timezone").eq("id", event.venue_id).single(),
  ]);
  if (!venues?.length || !currentVenue) notFound();

  return <section className="mx-auto max-w-2xl">
    <Link href={`/app/events/${event.id}`} className="inline-flex min-h-11 items-center gap-1 text-sm text-neutral-500 hover:text-white"><ChevronLeft size={17}/>Volver al evento</Link>
    <p className="eyebrow mt-8">Configuración</p>
    <h1 className="page-title mt-3">Editar evento</h1>
    <p className="mt-3 text-neutral-500">Actualizá la información que ven compradores y equipo de acceso.</p>
    <EventEditForm event={event} venues={venues} timezone={currentVenue.timezone}/>
  </section>;
}
