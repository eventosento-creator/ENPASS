import Link from "next/link";
import { notFound } from "next/navigation";
import { Armchair, ArrowUpRight, Eye, Link2, Ticket, UsersRound, WalletCards } from "lucide-react";
import { createClient } from "@/shared/database/server";
import { formatMoney } from "@/shared/lib/format";
import { EventSectionNav } from "@/modules/events/ui/event-section-nav";
import { AddPromoterDrawer } from "@/modules/promoters/ui/promoter-forms";

export default async function EventPromotersPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("id, name, slug, organization_id").eq("id", eventId).single();
  if (!event) notFound();

  await supabase.rpc("reconcile_event_promoter_commissions", { target_event: eventId });
  const [{ data: metrics, error }, { data: tableMetrics, error: tableError }] = await Promise.all([
    supabase.rpc("get_event_promoter_metrics", { target_event: eventId }),
    supabase.rpc("get_event_promoter_table_metrics", { target_event: eventId }),
  ]);
  if (error || tableError) throw new Error("No pudimos cargar los RRPP.");
  const tablesByRelation = new Map((tableMetrics ?? []).map((row) => [row.event_promoter_id, row]));
  const rows = (metrics ?? []).map((row) => {
    const table = tablesByRelation.get(row.event_promoter_id) ?? { tables_sold: 0, table_revenue: 0 };
    return { ...row, tickets_sold: Math.max(0, row.tickets_sold - table.tables_sold), ticket_revenue: Math.max(0, row.ticket_revenue - table.table_revenue), total_revenue: row.ticket_revenue, tables_sold: table.tables_sold };
  });
  const totals = rows.reduce((result, row) => ({
    tickets: result.tickets + row.tickets_sold,
    tables: result.tables + row.tables_sold,
    revenue: result.revenue + row.total_revenue,
    commission: result.commission + row.confirmed_commission,
  }), { tickets: 0, tables: 0, revenue: 0, commission: 0 });

  return <>
    <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow">{event.name}</p><h1 className="page-title mt-3">RRPP</h1><p className="mt-3 max-w-xl text-sm leading-6 text-neutral-500">Links propios, ventas atribuidas y comisiones congeladas al confirmar cada pago.</p></div><AddPromoterDrawer eventId={eventId}/></header>
    <EventSectionNav eventId={eventId} active="promoters"/>
    {rows.length > 0 && <section className={`mt-6 grid gap-3 sm:grid-cols-2 ${totals.tables > 0 ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}><Metric icon={<Ticket size={17}/>} label="Entradas vía RRPP" value={String(totals.tickets)}/>{totals.tables > 0 && <Metric icon={<Armchair size={17}/>} label="Mesas vía RRPP" value={String(totals.tables)}/>}<Metric icon={<ArrowUpRight size={17}/>} label="Ventas atribuidas" value={formatMoney(totals.revenue)}/><Metric icon={<WalletCards size={17}/>} label="Comisión confirmada" value={formatMoney(totals.commission)}/></section>}
    {rows.length ? <section className="mt-8"><div className="flex items-center justify-between gap-4"><div><p className="eyebrow">Ranking</p><h2 className="section-title mt-2">Por ventas atribuidas</h2></div><span className="text-xs font-semibold text-neutral-600">{rows.length} RRPP</span></div><div className="mt-4 grid gap-3">{rows.map((row, index) => <Link href={`/app/events/${eventId}/promoters/${row.event_promoter_id}`} className="card card-interactive grid gap-5 p-5 sm:grid-cols-[auto_1fr_auto] sm:items-center" key={row.event_promoter_id}><span className="grid size-10 place-items-center rounded-full bg-white/[.05] text-sm font-black text-neutral-500">{index + 1}</span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-lg font-black">{row.display_name}</h3>{row.status === "inactive" && <span className="rounded-full bg-white/[.05] px-2 py-1 text-[10px] font-black uppercase tracking-wider text-neutral-600">Inactivo</span>}</div><p className="mt-1 flex items-center gap-1.5 text-xs text-neutral-600"><Link2 size={13}/>/e/{event.slug}/{row.public_slug}</p><div className={`mt-4 grid gap-3 ${row.tables_sold > 0 ? "grid-cols-4" : "grid-cols-3"}`}><SmallMetric label="Entradas" value={String(row.tickets_sold)}/>{row.tables_sold > 0 && <SmallMetric label="Mesas" value={String(row.tables_sold)}/>}<SmallMetric label="Vendido" value={formatMoney(row.total_revenue, row.currency)}/><SmallMetric label="Comisión" value={formatMoney(row.confirmed_commission, row.currency)}/></div></div><div className="flex items-center justify-between border-t border-white/[.07] pt-4 text-xs text-neutral-500 sm:block sm:border-0 sm:pt-0 sm:text-right"><span className="inline-flex items-center gap-1.5"><Eye size={14}/>{row.visits} visitas</span><p className="mt-1">{conversionLabel(row.paid_orders, row.visits)}</p></div></Link>)}</div></section> : <section className="card mt-8 px-6 py-14 text-center"><UsersRound className="mx-auto text-neutral-700" size={36}/><h2 className="mt-5 text-xl font-black">Todavía no agregaste RRPP</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-neutral-500">Dales un link propio y seguí sus ventas automáticamente.</p><div className="mt-6 flex justify-center"><AddPromoterDrawer eventId={eventId}/></div></section>}
  </>;
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="card p-5"><div className="flex items-center gap-2 text-neutral-600">{icon}<p className="text-xs font-bold uppercase tracking-wider">{label}</p></div><p className="metric-value mt-3">{value}</p></div>;
}

function SmallMetric({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[10px] font-bold uppercase tracking-wider text-neutral-600">{label}</p><p className="mt-1 truncate text-sm font-black">{value}</p></div>;
}

function conversionLabel(orders: number, visits: number) {
  if (visits < 1) return "Sin conversión todavía";
  return `${Math.round((orders / visits) * 100)}% conversión`;
}
