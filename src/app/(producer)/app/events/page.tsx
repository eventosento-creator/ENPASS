import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, Plus } from "lucide-react";
import { getCurrentOrganization } from "@/modules/organizations/application/queries";
import { createClient } from "@/shared/database/server";
import { EventCard } from "@/modules/events/ui/event-card";
import { EmptyState } from "@/shared/ui/empty-state";

const statusFilters = [
  { value: "upcoming", label: "Próximos" },
  { value: "draft", label: "Borradores" },
  { value: "published", label: "Publicados" },
  { value: "sold_out", label: "Agotados" },
  { value: "finished", label: "Finalizados" },
  { value: "all", label: "Todos" },
] as const;

function isPastEvent(event: { starts_at: string; ends_at: string | null; status: string }) {
  return event.status === "finished" || event.status === "cancelled" || new Date(event.ends_at ?? event.starts_at).getTime() < Date.now();
}

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const org = await getCurrentOrganization(); if (!org) redirect("/app/onboarding");
  const query = await searchParams;
  const supabase = await createClient(); const [{ data: events }, { data: venues }, { data: holds }] = await Promise.all([supabase.from("events").select("*").eq("organization_id", org.id).order("starts_at", { ascending: false }), supabase.from("venues").select("*").eq("organization_id", org.id), supabase.from("ticket_holds").select("event_id, quantity").eq("organization_id", org.id).eq("status", "active").gt("expires_at", new Date().toISOString())]);
  const venueById = new Map((venues ?? []).map(venue => [venue.id, venue])); const reservations = (holds ?? []).reduce<Record<string, number>>((totals, hold) => ({ ...totals, [hold.event_id]: (totals[hold.event_id] ?? 0) + hold.quantity }), {});
  const activeFilter = statusFilters.some(filter => filter.value === query.status) ? query.status! : "upcoming";
  const visibleEvents = (events ?? []).filter(event => {
    if (activeFilter === "all") return true;
    if (activeFilter === "upcoming") return !isPastEvent(event);
    if (activeFilter === "finished") return isPastEvent(event);
    return event.status === activeFilter && !isPastEvent(event);
  });
  const countsByFilter = Object.fromEntries(statusFilters.map(filter => [filter.value, (events ?? []).filter(event => {
    if (filter.value === "all") return true;
    if (filter.value === "upcoming") return !isPastEvent(event);
    if (filter.value === "finished") return isPastEvent(event);
    return event.status === filter.value && !isPastEvent(event);
  }).length]));
  return <><div className="flex items-end justify-between gap-4"><div><p className="eyebrow">Tus fechas</p><h1 className="page-title mt-2">Eventos</h1><p className="mt-3 text-neutral-500">Creá, publicá y gestioná cada evento.</p></div><Link aria-label="Nuevo evento" className="btn btn-primary" href="/app/events/new"><Plus size={18}/><span className="hidden sm:inline">Nuevo evento</span></Link></div>
  {!!events?.length && <nav aria-label="Filtrar eventos por estado" className="mt-8 flex gap-2 overflow-x-auto pb-1">{statusFilters.map(filter => <Link aria-current={activeFilter === filter.value ? "page" : undefined} className={`min-h-10 shrink-0 rounded-full border px-4 py-2 text-sm font-bold transition ${activeFilter === filter.value ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]" : "border-white/[.08] text-neutral-500 hover:text-white"}`} href={filter.value === "upcoming" ? "/app/events" : `/app/events?status=${filter.value}`} key={filter.value}>{filter.label} <span className="opacity-60">({countsByFilter[filter.value]})</span></Link>)}</nav>}
  {!events?.length ? <div className="mt-8"><EmptyState icon={CalendarDays} title="Tu primera fecha empieza acá" description="Subí el flyer, agregá entradas y publicala en pocos pasos." action={<Link className="btn btn-primary" href="/app/events/new">Crear fecha</Link>}/></div> : visibleEvents.length ? <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{visibleEvents.map(event => <EventCard key={event.id} event={event} venue={venueById.get(event.venue_id)} reserved={reservations[event.id] ?? 0}/>)}</div> : <div className="mt-6"><EmptyState icon={CalendarDays} title={activeFilter === "upcoming" ? "No tenés fechas próximas" : "No hay eventos en este estado"} description={activeFilter === "upcoming" ? "Tus eventos pasados quedaron en \"Finalizados\"." : "Probá con otro filtro para ver tus fechas."} action={<Link className="btn btn-secondary" href="/app/events">Ver próximos</Link>}/></div>}</>;
}
