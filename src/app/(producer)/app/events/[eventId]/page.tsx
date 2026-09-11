import Link from "next/link";
import { notFound } from "next/navigation";
import { Armchair, BarChart3, CalendarDays, Clock, DoorOpen, ExternalLink, FileText, MailWarning, MapPin, Pencil, ShoppingCart, Ticket, UserRoundCheck, Users, Wallet, Zap } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { createClient } from "@/shared/database/server";
import { formatEventDate, formatMoney } from "@/shared/lib/format";
import { EventCoverUpload } from "@/modules/events/ui/forms";
import { publishEvent } from "@/modules/events/application/actions";
import { EventCover } from "@/modules/events/ui/event-cover";
import { EventStatusBadge } from "@/modules/events/ui/event-status-badge";
import { EventSectionNav } from "@/modules/events/ui/event-section-nav";
import { DuplicateEventForm } from "@/modules/events/ui/duplicate-event-form";
import { ShareEventButton } from "@/modules/events/ui/share-event-button";
import { EventActionsMenu } from "@/modules/events/ui/event-actions-menu";
import { getEventCapabilities } from "@/modules/events/domain/event-profile";
import { getEventViewerRole, restrictCapabilitiesForCollaborator } from "@/modules/events/application/viewer";
import { getEventCollaborators } from "@/modules/collaborators/application/access";
import { CollaboratorsCard } from "@/modules/collaborators/ui/collaborators-card";
import { StatCard } from "@/shared/ui/stat-card";

export default async function EventDetailPage({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<{ error?: string; published?: string }> }) {
  const { eventId } = await params; const query = await searchParams; const supabase = await createClient();
  const [{ data: event }, { data: ticketTypes }, { data: eventTables }, { data: holds }, { data: tableHolds }, { data: metricsData }, { data: tableMetricsData }, { data: attributionData }, { data: tableAttributionData }] = await Promise.all([supabase.from("events").select("*").eq("id", eventId).single(), supabase.from("ticket_types").select("*").eq("event_id", eventId).order("sort_order"), supabase.from("event_tables").select("id, capacity, active").eq("event_id", eventId), supabase.from("ticket_holds").select("quantity").eq("event_id", eventId).eq("status", "active").gt("expires_at", new Date().toISOString()), supabase.from("table_holds").select("event_table_id").eq("event_id", eventId).eq("status", "active").gt("expires_at", new Date().toISOString()), supabase.rpc("get_event_ticket_metrics", { target_event: eventId }), supabase.rpc("get_event_table_metrics", { target_event: eventId }), supabase.rpc("get_event_attribution_metrics", { target_event: eventId }), supabase.rpc("get_event_table_attribution_metrics", { target_event: eventId })]);
  if (!event) notFound();
  const viewerRole = await getEventViewerRole(event.organization_id);
  const isManager = viewerRole === "manager";
  const capabilities = isManager ? getEventCapabilities(event) : restrictCapabilitiesForCollaborator(getEventCapabilities(event));
  const collaborators = isManager ? await getEventCollaborators(event.id) : [];
  const { data: venue } = await supabase.from("venues").select("*").eq("id", event.venue_id).single(); if (!venue) notFound(); const ticketInventory = capabilities.tickets ? (ticketTypes ?? []).reduce((sum, type) => sum + type.quantity, 0) : 0; const tableInventory = capabilities.tables ? (eventTables ?? []).filter((table) => table.active).reduce((sum, table) => sum + table.capacity, 0) : 0; const tableCapacityById = new Map((eventTables ?? []).map((table) => [table.id, table.capacity])); const reserved = (capabilities.tickets ? (holds ?? []).reduce((sum, hold) => sum + hold.quantity, 0) : 0) + (capabilities.tables ? (tableHolds ?? []).reduce((sum, hold) => sum + (tableCapacityById.get(hold.event_table_id) ?? 0), 0) : 0);
  const ticketMetrics = metricsData?.[0] ?? { tickets_issued: 0, paid_orders: 0, delivery_failures: 0 };
  const attribution = attributionData?.[0] ?? { promoter_ticket_revenue: 0, direct_ticket_revenue: 0, promoter_tickets: 0 };
  const tableMetrics = tableMetricsData?.[0] ?? { sold_tables: 0, total_tables: 0, table_revenue: 0, held_tables: 0, currency: event.currency };
  const tableAttribution = tableAttributionData?.[0] ?? { promoter_table_revenue: 0, direct_table_revenue: 0, promoter_tables: 0 };
  const ticketAttribution = { promoterRevenue: Math.max(0, attribution.promoter_ticket_revenue - tableAttribution.promoter_table_revenue), directRevenue: Math.max(0, attribution.direct_ticket_revenue - tableAttribution.direct_table_revenue), promoterTickets: Math.max(0, attribution.promoter_tickets - tableAttribution.promoter_tables) };
  const duplicatedStartsAt = formatInTimeZone(new Date(new Date(event.starts_at).getTime() + 7 * 86_400_000), venue.timezone, "yyyy-MM-dd'T'HH:mm");
  const totalRevenue = ticketAttribution.promoterRevenue + ticketAttribution.directRevenue + tableAttribution.promoter_table_revenue + tableAttribution.direct_table_revenue + tableMetrics.table_revenue;
  const capacityPct = event.capacity > 0 ? Math.min(100, Math.round(((ticketInventory + tableInventory) / event.capacity) * 100)) : 0;
  const publicUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://enpass.com.ar"}/e/${event.slug}`;
  const primaryTicketType = (ticketTypes ?? [])[(ticketTypes ?? []).length - 1];
  const primaryTicketStock = primaryTicketType ? Math.max(0, primaryTicketType.quantity - ticketMetrics.tickets_issued) : 0;
  return <>
    <section className="card p-5 sm:p-6"><div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-center gap-4"><div className="relative size-16 shrink-0 overflow-hidden rounded-xl sm:size-20"><EventCover src={event.cover_image_url} alt={`Flyer de ${event.name}`} className="h-full w-full" sizes="80px"/></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2.5"><h1 className="truncate text-2xl font-black tracking-[-.03em] sm:text-3xl">{event.name}</h1><EventStatusBadge status={event.status}/></div><p className="mt-2 flex items-center gap-1.5 text-sm text-neutral-500"><CalendarDays size={14} className="shrink-0"/>{formatEventDate(event.starts_at, venue.timezone)}</p><p className="mt-1 flex items-center gap-1.5 text-sm text-neutral-500"><MapPin size={14} className="shrink-0"/><span className="truncate">{venue.name} · {venue.address}, {venue.city}</span></p></div></div><div className="flex shrink-0 items-center gap-2">{event.status === "published" && <Link target="_blank" href={`/e/${event.slug}`} className="btn btn-secondary" aria-label="Ver evento"><ExternalLink size={16}/><span className="hidden lg:inline">Ver evento</span></Link>}<ShareEventButton url={publicUrl}/>{isManager && !["finished", "cancelled"].includes(event.status) && <Link href={`/app/events/${event.id}/edit`} className="btn btn-primary"><Pencil size={16}/>Editar</Link>}{isManager && <EventActionsMenu>
      {capabilities.access && ["published", "sold_out"].includes(event.status) && <Link href={`/app/events/${event.id}/access`} className="btn btn-secondary w-full justify-start"><DoorOpen size={16}/>Abrir accesos</Link>}
      <DuplicateEventForm eventId={event.id} eventName={event.name} timezone={venue.timezone} defaultStartsAt={duplicatedStartsAt} capabilities={capabilities}/>
      <EventCoverUpload organizationId={event.organization_id} eventId={event.id}/>
    </EventActionsMenu>}</div></div></section>
    <EventSectionNav eventId={event.id} active="summary" capabilities={capabilities}/>
    {query.error && <p className="status-danger mt-6 rounded-xl p-4 text-sm">No se pudo publicar: revisá que la fecha sea futura y el inventario no supere la capacidad.</p>}{query.published && <p className="status-success mt-6 rounded-xl p-4 text-sm">Evento publicado. Ya podés compartirlo.</p>}
    <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard icon={Wallet} tone="emerald" label="Ventas pagadas" value={String(ticketMetrics.paid_orders)} sublabel="Ahora mismo"/>
      {capabilities.tickets && <StatCard icon={Ticket} tone="blue" label="Entradas emitidas" value={String(ticketMetrics.tickets_issued)} sublabel="Total de entradas"/>}
      <div className="card p-5"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-neutral-500/10 text-neutral-500"><Users size={19}/></span><p className="text-xs font-bold uppercase tracking-wider text-neutral-600">Capacidad</p></div><div className="mt-4 flex items-baseline justify-between"><p className="text-2xl font-black">{ticketInventory + tableInventory} / {event.capacity}</p><span className="text-xs font-bold text-neutral-500">{capacityPct}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-500/15"><div className="h-full rounded-full bg-neutral-700" style={{ width: `${capacityPct}%` }}/></div></div>
      <StatCard icon={BarChart3} tone="violet" label="Facturación" value={formatMoney(totalRevenue, event.currency)} sublabel="Ventas confirmadas"/>
    </section>
    <section className="mt-4 card p-5 sm:p-6"><div className="grid gap-5 sm:grid-cols-3 sm:divide-x sm:divide-white/[.07]">
      <MiniStat icon={Clock} label="Reservas pendientes" value={String(reserved)}/>
      <MiniStat icon={UserRoundCheck} label="Ventas vía RRPP" value={formatMoney(ticketAttribution.promoterRevenue + tableAttribution.promoter_table_revenue, event.currency)} href={capabilities.promoters ? `/app/events/${event.id}/promoters` : undefined}/>
      <MiniStat icon={ShoppingCart} label="Ventas directas" value={formatMoney(ticketAttribution.directRevenue + tableAttribution.direct_table_revenue, event.currency)}/>
    </div></section>
    {/* MiniStat kept local: compact inline layout (divide-x row) has no equivalent in the shared StatCard. */}
    <section className="mt-8 grid items-start gap-6 xl:grid-cols-[1fr_380px]">
      <div className="card p-5 sm:p-7"><div className="flex items-center justify-between gap-4"><div className="flex items-center gap-2"><FileText size={18} className="text-[var(--accent)]"/><h2 className="section-title">Información del evento</h2></div>{isManager && <Link href={`/app/events/${event.id}/edit`} className="btn btn-ghost min-h-9 px-3 text-xs"><Pencil size={14}/>Editar</Link>}</div><div className="mt-4 divide-y divide-white/[.07] border-y border-white/[.07]"><InfoRow icon={CalendarDays} label="Cuándo" value={formatEventDate(event.starts_at, venue.timezone)}/>{event.doors_open_at && <InfoRow icon={DoorOpen} label="Puertas" value={formatEventDate(event.doors_open_at, venue.timezone)}/>}<InfoRow icon={MapPin} label="Dónde" value={`${venue.name} · ${venue.address}, ${venue.city}`}/><InfoRow icon={Ticket} label="Documento" value={event.require_document ? "Se solicita DNI" : "No se solicita DNI"}/><div className="flex items-start gap-3 py-4"><span className="mt-0.5 size-2 shrink-0 rounded-full" style={{ backgroundColor: capabilities.access ? "var(--success)" : "var(--border)" }}/><div><p className="text-sm font-bold">{capabilities.access ? "Habilitado" : "No configurado"}</p><p className="mt-0.5 text-xs text-neutral-500">{capabilities.access ? "Los asistentes pueden ingresar con su entrada." : "Activá el control de acceso para validar entradas en la puerta."}</p></div></div></div>{event.description && <p className="mt-5 text-sm leading-7 text-neutral-400">{event.description}</p>}{capabilities.tables && tableMetrics.total_tables > 0 && <Link href={`/app/events/${event.id}/tables`} className="btn btn-secondary mt-5"><Armchair size={17}/>Gestionar mesas</Link>}</div>
      <div className="grid gap-6">
        {capabilities.tickets && <div className="card p-5 sm:p-7"><div className="flex items-center justify-between gap-4"><div className="flex items-center gap-2"><Ticket size={18} className="text-[var(--accent)]"/><h2 className="section-title">Entradas</h2></div><Link href={`/app/events/${event.id}/tickets` as never} className="btn btn-ghost min-h-9 px-3 text-xs">Ver todas</Link></div>{primaryTicketType ? <div className="mt-4 rounded-xl border border-white/[.08] p-4"><div className="flex items-center justify-between gap-3"><p className="font-bold">{primaryTicketType.name}</p><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${primaryTicketType.active ? "status-success" : "border border-white/10 text-neutral-500"}`}>{primaryTicketType.active ? "Activa" : "Inactiva"}</span></div><div className="mt-3 flex items-center justify-between text-sm"><span className="font-black">{formatMoney(primaryTicketType.price_amount, primaryTicketType.currency)}</span><span className="text-neutral-500">{primaryTicketStock} disponibles</span></div></div> : <p className="mt-4 text-sm text-neutral-500">Todavía no configuraste tipos de entrada.</p>}</div>}
        {ticketMetrics.delivery_failures > 0 && <Link href={`/app/events/${event.id}/tickets` as never} className="card card-interactive flex items-center gap-3 border-amber-400/20 bg-amber-400/[.04] p-4 text-sm font-bold text-amber-500"><MailWarning size={17} className="shrink-0"/>{ticketMetrics.delivery_failures} {ticketMetrics.delivery_failures === 1 ? "envío pendiente" : "envíos pendientes"}</Link>}
        <div className="card p-5 sm:p-7"><div className="flex items-center gap-2"><Zap size={18} className="text-[var(--accent)]"/><h2 className="section-title">Accesos rápidos</h2></div><div className="mt-4 grid gap-1">
          {capabilities.tickets && <QuickLink href={`/app/events/${event.id}/tickets` as never} icon={Ticket} title="Gestionar entradas" description="Editá precios, cupos y etapas de venta."/>}
          <QuickLink href={`/app/events/${event.id}/guests` as never} icon={Users} title="Lista de invitados" description="Quién compró, quién pagó y quién ya ingresó."/>
          {capabilities.promoters && <QuickLink href={`/app/events/${event.id}/promoters` as never} icon={UserRoundCheck} title="Invitar RRPP" description="Enviá el link a tu lista de RRPP."/>}
          {capabilities.pos && <QuickLink href={`/app/events/${event.id}/pos` as never} icon={ShoppingCart} title="Abrir caja" description="Gestioná cobros en puerta."/>}
        </div></div>
      </div>
    </section>
    {isManager && <section className="mt-8"><CollaboratorsCard eventId={event.id} collaborators={collaborators}/></section>}
    {isManager && event.status === "draft" && <form action={publishEvent} className="sticky-action sticky bottom-20 z-10 mt-6 md:bottom-4"><input type="hidden" name="eventId" value={event.id}/><button className="btn btn-primary min-h-14 w-full shadow-2xl">Publicar evento</button></form>}
  </>;
}
function MiniStat({ icon: Icon, label, value, href }: { icon: typeof Clock; label: string; value: string; href?: string }) {
  const content = <><span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-neutral-600"><Icon size={14}/>{label}</span><p className="mt-2 text-xl font-black">{value}</p></>;
  return href ? <Link href={href as Parameters<typeof Link>[0]["href"]} className="rounded-xl px-1 py-1 transition hover:bg-white/[.03] sm:px-4">{content}</Link> : <div className="px-1 sm:px-4">{content}</div>;
}
function InfoRow({ icon: Icon, label, value }: { icon: typeof CalendarDays; label: string; value: string }) { return <div className="flex items-start gap-3 py-4"><Icon size={16} className="mt-0.5 shrink-0 text-neutral-600"/><div className="grid gap-1 sm:grid-cols-[100px_1fr] sm:items-baseline"><span className="text-xs font-bold uppercase tracking-wider text-neutral-600">{label}</span><span className="text-sm text-neutral-300">{value}</span></div></div>; }
function QuickLink({ href, icon: Icon, title, description }: { href: Parameters<typeof Link>[0]["href"]; icon: typeof Ticket; title: string; description: string }) { return <Link href={href} className="flex items-center gap-3 rounded-xl px-2 py-3 transition hover:bg-white/[.04]"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/[.05]"><Icon size={17}/></span><span className="min-w-0 flex-1"><span className="block text-sm font-bold">{title}</span><span className="block text-xs text-neutral-500">{description}</span></span><ExternalLink size={14} className="shrink-0 text-neutral-600"/></Link>; }
