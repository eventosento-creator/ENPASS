import Link from "next/link";
import { notFound } from "next/navigation";
import { Armchair, ChevronLeft, Eye, Link2, Ticket, WalletCards } from "lucide-react";
import { createClient } from "@/shared/database/server";
import { formatMoney } from "@/shared/lib/format";
import { EventSectionNav } from "@/modules/events/ui/event-section-nav";
import { CommissionRuleForm, EditPromoterForm, PromoterInviteForm, TableCommissionRuleForm } from "@/modules/promoters/ui/promoter-forms";
import { ShareLinkButtons } from "@/modules/promoters/ui/share-link-buttons";
import { setEventPromoterStatus } from "@/modules/promoters/application/actions";
import type { EventPromoter, EventTable, Json, Promoter, PromoterCommissionRule, TicketType } from "@/shared/database/types";

type Breakdown = { ticket_type_id: string | null; name: string; quantity: number };
type RecentSale = { quantity: number; ticket_revenue: number; items: string; created_at: string };

export default async function EventPromoterDetailPage({ params }: { params: Promise<{ eventId: string; eventPromoterId: string }> }) {
  const { eventId, eventPromoterId } = await params;
  const supabase = await createClient();
  await supabase.rpc("reconcile_event_promoter_commissions", { target_event: eventId });
  const [{ data: event }, { data: relationData }, { data: detailData }, { data: tableMetrics }] = await Promise.all([
    supabase.from("events").select("id, name, slug").eq("id", eventId).single(),
    supabase.from("event_promoters").select("*").eq("id", eventPromoterId).eq("event_id", eventId).single(),
    supabase.rpc("get_event_promoter_detail", { target_event_promoter: eventPromoterId }),
    supabase.rpc("get_event_promoter_table_metrics", { target_event: eventId }),
  ]);
  if (!event || !relationData || !detailData?.[0]) notFound();
  const relation = relationData as EventPromoter;
  const [{ data: promoterData }, { data: ruleData }, { data: ticketTypeData }, { data: eventTableData }] = await Promise.all([
    supabase.from("promoters").select("*").eq("id", relation.promoter_id).single(),
    supabase.from("promoter_commission_rules").select("*").eq("event_promoter_id", relation.id).eq("active", true).order("created_at"),
    supabase.from("ticket_types").select("*").eq("event_id", eventId).order("sort_order"),
    supabase.from("event_tables").select("*").eq("event_id", eventId).order("sort_order"),
  ]);
  if (!promoterData) notFound();
  const promoter = promoterData as Promoter;
  const rules = (ruleData ?? []) as PromoterCommissionRule[];
  const ticketTypes = (ticketTypeData ?? []) as TicketType[];
  const eventTables = (eventTableData ?? []) as EventTable[];
  const detail = detailData[0];
  const tableMetric = tableMetrics?.find((row) => row.event_promoter_id === eventPromoterId) ?? { tables_sold: 0, table_revenue: 0 };
  const ticketCount = Math.max(0, detail.tickets_sold - tableMetric.tables_sold);
  const ticketRevenue = Math.max(0, detail.ticket_revenue - tableMetric.table_revenue);
  const breakdown = asBreakdown(detail.ticket_breakdown).filter((item) => item.ticket_type_id !== null);
  const recentSales = asRecentSales(detail.recent_sales);
  const publicLink = absoluteUrl(`/e/${event.slug}/${relation.public_slug}`);

  return <>
    <Link href={`/app/events/${eventId}/promoters`} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-neutral-500 hover:text-white"><ChevronLeft size={17}/>Todos los RRPP</Link>
    <header className="mt-3 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex flex-wrap items-center gap-3"><h1 className="page-title">{promoter.display_name}</h1><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${relation.status === "active" ? "bg-[var(--accent)]/10 text-[var(--accent)]" : "bg-white/[.05] text-neutral-500"}`}>{relation.status === "active" ? "Activo" : "Inactivo"}</span></div><p className="mt-3 text-sm text-neutral-500">RRPP de {event.name}</p></div><form action={setEventPromoterStatus}><input type="hidden" name="eventId" value={eventId}/><input type="hidden" name="eventPromoterId" value={relation.id}/><input type="hidden" name="status" value={relation.status === "active" ? "inactive" : "active"}/><button className={`btn ${relation.status === "active" ? "btn-danger" : "btn-secondary"}`}>{relation.status === "active" ? "Desactivar RRPP" : "Reactivar RRPP"}</button></form></header>
    <EventSectionNav eventId={eventId} active="promoters"/>
    <section className={`mt-6 grid gap-3 sm:grid-cols-2 ${tableMetric.tables_sold > 0 ? "xl:grid-cols-5" : "xl:grid-cols-4"}`}><Metric icon={<Ticket size={17}/>} label="Entradas" value={String(ticketCount)}/>{tableMetric.tables_sold > 0 && <Metric icon={<Armchair size={17}/>} label="Mesas" value={String(tableMetric.tables_sold)}/>}<Metric icon={<Link2 size={17}/>} label="Facturación" value={formatMoney(detail.ticket_revenue, detail.currency)}/><Metric icon={<WalletCards size={17}/>} label="Comisión" value={formatMoney(detail.confirmed_commission, detail.currency)}/><Metric icon={<Eye size={17}/>} label="Visitas" value={String(detail.visits)}/></section>
    <section className="card mt-5 p-5 sm:p-6"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-neutral-600"><Link2 size={14}/>Link público</div><p className="mt-3 break-all text-sm font-semibold text-neutral-300">{publicLink}</p><div className="mt-4"><ShareLinkButtons url={publicLink}/></div></section>
    <section className="mt-8 grid items-start gap-5 xl:grid-cols-2"><EditPromoterForm eventId={eventId} relation={relation} promoter={promoter}/><div className="grid gap-5"><CommissionRuleForm eventId={eventId} relationId={relation.id} ticketTypes={ticketTypes} rules={rules}/>{eventTables.length > 0 && <TableCommissionRuleForm eventId={eventId} relationId={relation.id} tables={eventTables} rules={rules}/>}</div></section>
    <section className="mt-5"><PromoterInviteForm eventId={eventId} eventPromoterId={relation.id} hasEmail={Boolean(promoter.email)}/></section>
    <section className="mt-10 grid items-start gap-8 lg:grid-cols-2"><div><p className="eyebrow">Desglose</p><h2 className="section-title mt-2">Entradas vendidas</h2>{breakdown.length ? <div className="mt-4 divide-y divide-white/[.07] border-y border-white/[.07]">{breakdown.map((item) => <div className="flex items-center justify-between gap-4 py-4" key={item.name}><span className="text-sm text-neutral-400">{item.name}</span><strong>{item.quantity}</strong></div>)}</div> : <p className="mt-4 text-sm text-neutral-600">Todavía no hay entradas pagadas.</p>}{tableMetric.tables_sold > 0 && <div className="mt-7"><p className="text-xs font-black uppercase tracking-wider text-neutral-600">Mesas</p><div className="mt-3 flex items-center justify-between border-y border-white/[.07] py-4"><span className="text-sm text-neutral-400">Mesas confirmadas</span><strong>{tableMetric.tables_sold} · {formatMoney(tableMetric.table_revenue, detail.currency)}</strong></div></div>}<p className="mt-4 text-xs text-neutral-700">Entradas: {formatMoney(ticketRevenue, detail.currency)}</p></div><div><p className="eyebrow">Actividad</p><h2 className="section-title mt-2">Últimas ventas</h2>{recentSales.length ? <div className="mt-4 grid gap-3">{recentSales.map((sale) => <article className="card p-4" key={`${sale.created_at}-${sale.items}`}><div className="flex items-start justify-between gap-4"><div><p className="font-bold">{sale.items}</p><p className="mt-1 text-xs text-neutral-600">{relativeDate(sale.created_at)}</p></div><div className="text-right"><p className="font-black">{formatMoney(sale.ticket_revenue, detail.currency)}</p><p className="mt-1 text-xs text-neutral-600">{sale.quantity} {sale.quantity === 1 ? "ítem" : "ítems"}</p></div></div></article>)}</div> : <p className="mt-4 text-sm text-neutral-600">Las ventas confirmadas aparecerán acá sin datos del comprador.</p>}</div></section>
  </>;
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="card p-5"><div className="flex items-center gap-2 text-neutral-600">{icon}<span className="text-xs font-bold uppercase tracking-wider">{label}</span></div><p className="metric-value mt-3">{value}</p></div>; }
function absoluteUrl(path: string) { return new URL(path, process.env.APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").toString(); }
function asBreakdown(value: Json): Breakdown[] { return Array.isArray(value) ? value.filter((item): item is Breakdown => isRecord(item) && (typeof item.ticket_type_id === "string" || item.ticket_type_id === null) && typeof item.name === "string" && typeof item.quantity === "number") : []; }
function asRecentSales(value: Json): RecentSale[] { return Array.isArray(value) ? value.filter((item): item is RecentSale => isRecord(item) && typeof item.quantity === "number" && typeof item.ticket_revenue === "number" && typeof item.items === "string" && typeof item.created_at === "string") : []; }
function isRecord(value: Json): value is { [key: string]: Json | undefined } { return typeof value === "object" && value !== null && !Array.isArray(value); }
function relativeDate(value: string) { const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000)); if (minutes < 1) return "Ahora"; if (minutes < 60) return `Hace ${minutes} min`; return new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
