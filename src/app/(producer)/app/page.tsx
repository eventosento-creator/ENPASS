import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CalendarDays, CalendarPlus, CircleDollarSign, DoorOpen, Gauge, Ticket } from "lucide-react";
import { getCurrentOrganization } from "@/modules/organizations/application/queries";
import { createClient } from "@/shared/database/server";
import { formatCompactEventDate } from "@/shared/lib/format";
import { EventCover } from "@/modules/events/ui/event-cover";
import { EventStatusBadge } from "@/modules/events/ui/event-status-badge";
import { AvailabilityIndicator } from "@/modules/events/ui/availability-indicator";
import { EventCard } from "@/modules/events/ui/event-card";
import { EmptyState } from "@/shared/ui/empty-state";

export default async function DashboardPage() {
  const organization = await getCurrentOrganization();
  if (!organization) redirect("/app/onboarding");
  const supabase = await createClient();
  const now = new Date().toISOString();
  const [{ data: events }, { data: venues }, { data: holds }, { data: metricsData }] = await Promise.all([
    supabase.from("events").select("*").eq("organization_id", organization.id).order("starts_at").limit(4),
    supabase.from("venues").select("*").eq("organization_id", organization.id),
    supabase.from("ticket_holds").select("event_id, quantity").eq("organization_id", organization.id).eq("status", "active").gt("expires_at", now),
    supabase.rpc("get_dashboard_sales_metrics", { target_organization: organization.id }),
  ]);
  const venueById = new Map((venues ?? []).map(venue => [venue.id, venue]));
  const reservationsByEvent = (holds ?? []).reduce<Record<string, number>>((totals, hold) => ({ ...totals, [hold.event_id]: (totals[hold.event_id] ?? 0) + hold.quantity }), {});
  const upcoming = (events ?? []).filter(event => new Date(event.starts_at) > new Date() && !["cancelled", "finished"].includes(event.status));
  const nextEvent = upcoming[0];
  const otherEvents = upcoming.slice(1, 4);
  const metrics = metricsData?.[0] ?? { confirmed_orders: 0, confirmed_tickets: 0, pending_reservations: 0 };
  const [ticketMetricResult, accessMetricResult] = nextEvent ? await Promise.all([
    supabase.rpc("get_event_ticket_metrics", { target_event: nextEvent.id }),
    supabase.rpc("get_event_access_metrics", { target_event: nextEvent.id }),
  ]) : [{ data: null }, { data: null }];
  const nextTicketMetrics = ticketMetricResult.data?.[0] ?? { tickets_issued: 0 };
  const nextAccessMetrics = accessMetricResult.data?.[0] ?? { entries_today: 0 };
  const occupied = nextEvent ? nextTicketMetrics.tickets_issued + (reservationsByEvent[nextEvent.id] ?? 0) : 0;
  return <>
    <div className="flex items-end justify-between gap-4"><div><p className="text-sm font-semibold text-[var(--accent)]">{organization.name}</p><h1 className="page-title mt-1">Tus eventos, en un solo lugar.</h1></div><Link aria-label="Crear evento" className="btn btn-primary" href="/app/events/new"><CalendarPlus size={18}/><span className="hidden sm:inline">Crear evento</span></Link></div>
    <section className="mt-10"><p className="eyebrow">Próximo evento</p>{nextEvent ? <NextEvent event={nextEvent} venue={venueById.get(nextEvent.venue_id)} occupied={occupied}/> : <div className="mt-4"><EmptyState icon={CalendarDays} title="Todavía no hay eventos" description="Creá tu primera fiesta o evento y empezá a compartirlo." action={<Link className="btn btn-primary" href="/app/events/new">Crear evento</Link>}/></div>}</section>
    <section aria-label="Métricas principales" className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4"><Metric icon={<CircleDollarSign size={17}/>} label="Ventas" value={String(metrics.confirmed_orders)}/><Metric icon={<Ticket size={17}/>} label="Entradas emitidas" value={String(nextTicketMetrics.tickets_issued)}/><Metric icon={<DoorOpen size={17}/>} label="Ingresos validados" value={String(nextAccessMetrics.entries_today)}/><Metric icon={<Gauge size={17}/>} label="Capacidad ocupada" value={nextEvent ? `${occupied} / ${nextEvent.capacity}` : "—"}/></section>
    {otherEvents.length > 0 && <section className="mt-12"><div className="flex items-center justify-between"><h2 className="section-title">Después de esta noche</h2><Link className="text-sm text-neutral-500 hover:text-white" href="/app/events">Ver todas</Link></div><div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{otherEvents.map(event => <EventCard key={event.id} event={event} venue={venueById.get(event.venue_id)} reserved={reservationsByEvent[event.id] ?? 0}/>)}</div></section>}
  </>;
}
function NextEvent({ event, venue, occupied }: { event: import("@/shared/database/types").Event; venue?: import("@/shared/database/types").Venue; occupied: number }) { return <article className="group card mt-4 overflow-hidden md:grid md:grid-cols-[42%_1fr]"><EventCover src={event.cover_image_url} alt={`Flyer de ${event.name}`} className="aspect-[4/3] md:aspect-auto md:min-h-[390px]" priority sizes="(max-width: 768px) 100vw, 40vw"/><div className="flex flex-col p-6 sm:p-8"><EventStatusBadge status={event.status} className="self-start"/><p className="mt-auto pt-8 text-xs font-black tracking-[.1em] text-[var(--accent)]">{formatCompactEventDate(event.starts_at, venue?.timezone ?? "America/Argentina/Mendoza")}</p><h2 className="mt-3 text-4xl font-black tracking-[-.045em] sm:text-5xl">{event.name}</h2>{venue && <p className="mt-2 text-neutral-500">{venue.name} · {venue.city}</p>}<div className="mt-8"><AvailabilityIndicator reserved={occupied} capacity={event.capacity} label="ocupadas"/></div><Link href={`/app/events/${event.id}`} className="btn btn-secondary mt-7 self-start">Administrar evento <ArrowRight size={17}/></Link></div></article>; }
function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="card p-4 sm:p-5"><div className="flex items-center gap-2 text-neutral-600">{icon}<p className="text-[11px] font-bold uppercase tracking-[.08em]">{label}</p></div><p className="metric-value mt-3">{value}</p></div>; }
