import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { EventForm } from "@/modules/events/ui/forms";
import { getCurrentOrganization } from "@/modules/organizations/application/queries";
import { createClient } from "@/shared/database/server";
import { EventCover } from "@/modules/events/ui/event-cover";
import { TicketTypeEditor } from "@/modules/events/ui/ticket-type-editor";
import { formatEventDate, formatMoney } from "@/shared/lib/format";
import { publishEvent } from "@/modules/events/application/actions";

export default async function NewEventPage({ searchParams }: { searchParams: Promise<{ step?: string; event?: string }> }) {
  const query = await searchParams;
  const org = await getCurrentOrganization(); if (!org) redirect("/app/onboarding?next=/app/events/new");
  const supabase = await createClient(); const { data: venues } = await supabase.from("venues").select("*").eq("organization_id", org.id).order("name");
  if (!venues?.length) return <section className="mx-auto max-w-xl"><p className="eyebrow">Nuevo evento</p><h1 className="mt-2 text-3xl font-black">Primero necesitás un lugar</h1><p className="mt-3 text-neutral-400">La capacidad y zona horaria del venue protegen la venta.</p><Link href="/app/venues" className="btn btn-primary mt-6">Crear lugar</Link></section>;
  const step = query.step === "2" || query.step === "3" ? Number(query.step) : 1;
  if (step === 1) return <WizardShell step={1} title="Nueva fecha" description="¿Qué estás organizando?"><EventForm organizationId={org.id} venues={venues}/></WizardShell>;
  if (!query.event) notFound();
  const [{ data: event }, { data: ticketTypes }] = await Promise.all([supabase.from("events").select("*").eq("id", query.event).eq("organization_id", org.id).single(), supabase.from("ticket_types").select("*").eq("event_id", query.event).order("sort_order")]);
  if (!event) notFound();
  if (step === 2) return <WizardShell step={2} title="Entradas" description="Ordenalas como querés venderlas."><TicketTypeEditor organizationId={org.id} eventId={event.id} ticketTypes={ticketTypes ?? []}/><div className="mt-6 flex items-center justify-between gap-3"><Link href={`/app/events/${event.id}`} className="btn btn-ghost"><ArrowLeft size={17}/>Salir</Link><Link aria-disabled={!ticketTypes?.length} href={ticketTypes?.length ? `/app/events/new?step=3&event=${event.id}` : `/app/events/new?step=2&event=${event.id}`} className={`btn btn-primary ${!ticketTypes?.length ? "pointer-events-none opacity-40" : ""}`}>Continuar <ArrowRight size={17}/></Link></div></WizardShell>;
  const venue = venues.find(item => item.id === event.venue_id);
  if (!venue) notFound();
  const totalInventory = (ticketTypes ?? []).reduce((sum, type) => sum + type.quantity, 0);
  return <WizardShell step={3} title="Todo listo" description="Revisá la fecha antes de publicarla."><div className="card overflow-hidden"><EventCover src={event.cover_image_url} alt={`Flyer de ${event.name}`} className="aspect-[16/8]" priority/><div className="p-5 sm:p-7"><h2 className="text-3xl font-black tracking-[-.04em]">{event.name}</h2><p className="mt-3 text-sm text-neutral-400">{formatEventDate(event.starts_at, venue.timezone)}</p><p className="mt-1 text-sm text-neutral-500">{venue.name} · {venue.address}</p><p className="mt-6 border-t border-white/[.08] pt-5 text-sm"><strong>{totalInventory}</strong> entradas configuradas</p><div className="mt-4 grid gap-2">{ticketTypes?.map(type => <div className="flex justify-between rounded-xl bg-black/25 p-3 text-sm" key={type.id}><span>{type.quantity} × {type.name}</span><strong>{formatMoney(type.price_amount, type.currency)}</strong></div>)}</div></div></div><div className="mt-6 grid gap-3 sm:grid-cols-2"><Link className="btn btn-secondary" href={`/app/events/${event.id}`}>Guardar borrador</Link><form action={publishEvent}><input type="hidden" name="eventId" value={event.id}/><button className="btn btn-primary w-full">Publicar evento</button></form></div></WizardShell>;
}

function WizardShell({ step, title, description, children }: { step: 1 | 2 | 3; title: string; description: string; children: React.ReactNode }) { return <section className="mx-auto max-w-2xl"><div className="flex items-center justify-between"><Link href="/app/events" className="text-sm text-neutral-500 hover:text-white">Cancelar</Link><span className="text-xs font-bold text-neutral-500">{step} de 3</span></div><div className="mt-4 grid grid-cols-3 gap-2" aria-label={`Paso ${step} de 3`}>{[1,2,3].map(item => <span key={item} className={`h-1 rounded-full ${item <= step ? "bg-[var(--accent)]" : "bg-white/10"}`}/>)}</div><p className="eyebrow mt-10">Crear evento</p><h1 className="page-title mt-3">{title}</h1><p className="mt-3 text-neutral-500">{description}</p><div className="mt-2">{children}</div></section>; }
