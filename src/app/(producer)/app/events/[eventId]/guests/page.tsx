import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Mail, Send, Users } from "lucide-react";
import { createClient } from "@/shared/database/server";
import { EventSectionNav } from "@/modules/events/ui/event-section-nav";
import { getEventCapabilities } from "@/modules/events/domain/event-profile";
import { EmptyState } from "@/shared/ui/empty-state";
import { GuestSearch, type GuestRow } from "@/modules/events/ui/guest-search";
import { CourtesyTicketForm } from "@/modules/orders/ui/courtesy-ticket-form";
import { SendReminderButton } from "@/modules/events/ui/send-reminder-button";
import { HowItWorksCard } from "@/shared/ui/how-it-works-card";

export default async function EventGuestsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("*").eq("id", eventId).single();
  if (!event) notFound();
  const capabilities = getEventCapabilities(event);

  const [{ data: tickets }, { data: ticketTypes }, { data: eventTables }, { data: eventSeats }] = await Promise.all([
    supabase.from("tickets").select("*").eq("event_id", eventId).order("holder_last_name"),
    supabase.from("ticket_types").select("id, name, active").eq("event_id", eventId).order("sort_order"),
    supabase.from("event_tables").select("id, name").eq("event_id", eventId),
    supabase.from("event_seats").select("id, label").eq("event_id", eventId),
  ]);

  const typeNameById = new Map((ticketTypes ?? []).map((type) => [type.id, type.name]));
  const tableNameById = new Map((eventTables ?? []).map((table) => [table.id, table.name]));
  const seatLabelById = new Map((eventSeats ?? []).map((seat) => [seat.id, seat.label]));

  const guests: GuestRow[] = (tickets ?? []).map((ticket) => {
    const typeLabel = ticket.ticket_type_id ? (typeNameById.get(ticket.ticket_type_id) ?? "Entrada")
      : ticket.event_table_id ? `Mesa · ${tableNameById.get(ticket.event_table_id) ?? "—"}`
      : ticket.event_seat_id ? `Asiento ${seatLabelById.get(ticket.event_seat_id) ?? "—"}`
      : "Entrada";
    return {
      id: ticket.id,
      name: `${ticket.holder_first_name} ${ticket.holder_last_name}`.trim() || "Sin nombre",
      document: ticket.holder_document,
      typeLabel,
      status: ticket.status,
      checkedIn: ticket.used_entries > 0,
      issuedAt: ticket.issued_at,
    };
  }).sort((a, b) => a.name.localeCompare(b.name, "es-AR"));

  const checkedInCount = guests.filter((guest) => guest.checkedIn).length;

  return <>
    <header className="flex flex-wrap items-end justify-between gap-5">
      <div><Link href={`/app/events/${event.id}`} className="inline-flex items-center gap-2 text-sm font-bold text-neutral-500 hover:text-white"><ArrowLeft size={16}/>Volver al evento</Link><p className="eyebrow mt-7">Invitados</p><h1 className="page-title mt-3">{event.name}</h1><p className="mt-3 text-sm text-neutral-500">{guests.length} {guests.length === 1 ? "entrada emitida" : "entradas emitidas"} · {checkedInCount} con ingreso registrado{event.reminder_sent_at && ` · Recordatorio enviado`}</p></div>
      <SendReminderButton eventId={event.id}/>
    </header>
    <EventSectionNav eventId={event.id} active="guests" capabilities={capabilities}/>
    {capabilities.tickets && <div className="mt-8"><CourtesyTicketForm eventId={event.id} ticketTypes={(ticketTypes ?? []).filter((type) => type.active)}/></div>}
    <section className="mt-8 grid gap-6 xl:grid-cols-[1fr_300px] xl:items-start">
      {guests.length ? <GuestSearch guests={guests}/> : <div><EmptyState icon={Users} title="Todavía no hay invitados" description="Cuando se confirme la primera venta, la lista de asistentes va a aparecer acá."/></div>}
      <HowItWorksCard title="Cómo funciona" layout="column" steps={[
        { icon: Mail, title: "Las cortesías se envían por mail", description: "Agregá una cortesía y la persona recibirá su entrada por correo electrónico." },
        { icon: CheckCircle2, title: "Podés hacer seguimiento", description: "Vas a ver quién confirmó, quién ingresó y quién aún no lo hizo." },
        { icon: Send, title: "Reenviá el acceso cuando quieras", description: "Si la persona no encuentra el mail, podés reenviarlo desde acá." },
      ]}/>
    </section>
  </>;
}
