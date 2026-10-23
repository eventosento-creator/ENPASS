import Link from "next/link";
import { AlertTriangle, Building2, Landmark, Users2, Wallet } from "lucide-react";
import { adminPeriods, getAdminOverview, getAdminSalesByDay, parsePeriod } from "@/modules/admin/application/queries";
import { SalesChart } from "@/modules/admin/ui/sales-chart";
import { formatMoneyCompact, formatShortDate, percentChange } from "@/modules/admin/ui/format";

const methodLabels = { mercado_pago: "Mercado Pago", transferencia: "Transferencia", caja: "Caja" } as const;
const methodColors = { mercado_pago: "#378ADD", transferencia: "#1D9E75", caja: "#B4B2A9" } as const;

export default async function AdminOverviewPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const period = parsePeriod((await searchParams).p);
  const [overview, salesByDay] = await Promise.all([getAdminOverview(period), getAdminSalesByDay(14)]);
  if (!overview) return <p className="text-sm text-neutral-500">No pudimos cargar el resumen. Probá de nuevo en un rato.</p>;
  const change = percentChange(overview.sales, overview.sales_prev);
  const methodsTotal = overview.methods.reduce((sum, method) => sum + method.amount, 0);
  const upToDate = overview.clubs.members > 0 ? Math.round(((overview.clubs.members - overview.clubs.overdue_members) / overview.clubs.members) * 100) : null;
  const actions = [
    { href: "/admin/transferencias", icon: Landmark, label: "Transferencias para revisar", count: overview.actions.transfers_review },
    { href: "/admin/clubes/gestion", icon: Users2, label: "Clubes que piden publicarse", count: overview.actions.listings_pending },
    { href: "/admin/liquidaciones", icon: Wallet, label: "Liquidaciones para pagar", count: overview.actions.payouts_to_pay },
    { href: "/admin/liquidaciones", icon: Wallet, label: "Productores con eventos terminados para liquidar", count: overview.actions.payouts_ready },
    { href: "/admin/pagos", icon: AlertTriangle, label: "Pagos con conflicto", count: overview.actions.conflicts },
  ];

  return <>
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="eyebrow">Administración</p><h1 className="page-title mt-1">Resumen</h1></div>
      <nav aria-label="Período" className="flex gap-1.5">
        {adminPeriods.map((option) => <Link key={option.value} href={(option.value === "mes" ? "/admin" : `/admin?p=${option.value}`) as never} aria-current={option.value === period ? "page" : undefined}
          className={`rounded-full border px-3.5 py-1.5 text-xs font-bold ${option.value === period ? "border-transparent bg-[var(--accent)] text-[var(--on-accent)]" : "border-[var(--border-strong)] text-neutral-500"}`}>{option.label}</Link>)}
      </nav>
    </header>

    <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Números del período">
      <Stat label="Ventas" value={formatMoneyCompact(overview.sales)} note={change === null ? "valor de las entradas" : `${change >= 0 ? "+" : ""}${change}% vs período anterior`} good={change !== null && change >= 0}/>
      <Stat label="Cargo de ENPASS" value={formatMoneyCompact(overview.fees)} note="tu ingreso"/>
      <Stat label="Entradas vendidas" value={overview.tickets.toLocaleString("es-AR")} note={`${overview.orders.toLocaleString("es-AR")} compras en ${overview.events_in_period} eventos`}/>
      <Stat label="Le debés a productores" value={formatMoneyCompact(overview.owed_total)} note={overview.owed_orgs ? `a ${overview.owed_orgs} ${overview.owed_orgs === 1 ? "productor" : "productores"} (transferencias)` : "nada pendiente"}/>
    </section>

    <SalesChart days={salesByDay}/>

    <div className="mt-5 grid gap-4 lg:grid-cols-2">
      <section className="card p-5" aria-label="Necesita tu acción">
        <h2 className="font-black">Necesita tu acción</h2>
        <div className="mt-2 divide-y divide-[var(--border)]">
          {actions.map((action) => <Link key={action.label} href={action.href as never} className="flex min-h-12 items-center justify-between gap-3 py-2 text-sm hover:underline">
            <span className="flex items-center gap-2.5 text-neutral-500"><action.icon size={16} aria-hidden/><span className="text-[var(--text)]">{action.label}</span></span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-black ${action.count > 0 ? "bg-amber-400/90 text-black" : "bg-[var(--surface-strong)] text-neutral-500"}`}>{action.count}</span>
          </Link>)}
        </div>
      </section>

      <section className="card p-5" aria-label="Próximos 7 días">
        <div className="flex items-center justify-between"><h2 className="font-black">Próximos 7 días</h2><Link href={"/admin/eventos" as never} className="text-xs font-bold text-neutral-500 underline">Ver todos</Link></div>
        <div className="mt-2 divide-y divide-[var(--border)]">
          {overview.upcoming.map((event) => <Link key={event.id} href={`/admin/eventos/${event.id}` as never} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:underline">
            <span className="min-w-0"><b className="block truncate">{event.name}</b><span className="text-xs text-neutral-500">{event.organization_name} · {formatShortDate(event.starts_at)}</span></span>
            <span className="shrink-0 text-right"><b>{event.sold} / {event.capacity}</b><span className="block text-xs text-neutral-500">{event.capacity ? Math.round((event.sold / event.capacity) * 100) : 0}%</span></span>
          </Link>)}
          {!overview.upcoming.length && <p className="py-3 text-sm text-neutral-500">No hay eventos en los próximos 7 días.</p>}
        </div>
      </section>

      <section className="card p-5" aria-label="Cómo pagan">
        <h2 className="font-black">Cómo pagan</h2>
        {methodsTotal > 0 ? <>
          <div className="mt-4 flex h-2.5 overflow-hidden rounded-full" role="img" aria-label="Reparto por medio de pago">{overview.methods.map((method) => <div key={method.method} style={{ width: `${(method.amount / methodsTotal) * 100}%`, background: methodColors[method.method] }}/>)}</div>
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-neutral-500">{overview.methods.map((method) => <li key={method.method} className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: methodColors[method.method] }}/>{methodLabels[method.method]} {Math.round((method.amount / methodsTotal) * 100)}% · {formatMoneyCompact(method.amount)}</li>)}</ul>
        </> : <p className="mt-3 text-sm text-neutral-500">Todavía no hay cobros en este período.</p>}
      </section>

      <section className="card p-5" aria-label="Clubes">
        <div className="flex items-center justify-between"><h2 className="font-black">Clubes</h2><Link href={"/admin/clubes" as never} className="text-xs font-bold text-neutral-500 underline">Ver clubes</Link></div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <MiniStat value={overview.clubs.count.toLocaleString("es-AR")} label="clubes"/>
          <MiniStat value={overview.clubs.members.toLocaleString("es-AR")} label="socios activos"/>
          <MiniStat value={upToDate === null ? "—" : `${upToDate}%`} label="socios al día"/>
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-neutral-500"><Building2 size={13} aria-hidden/>{overview.active_events} eventos activos en toda la plataforma</p>
      </section>
    </div>
  </>;
}

function Stat({ label, value, note, good }: { label: string; value: string; note: string; good?: boolean }) {
  return <div className="card p-4"><p className="text-xs font-bold text-neutral-500">{label}</p><p className="mt-1 text-2xl font-black tracking-[-.02em]">{value}</p><p className={`mt-1 text-xs ${good ? "text-emerald-600" : "text-neutral-500"}`}>{note}</p></div>;
}

function MiniStat({ value, label }: { value: string; label: string }) {
  return <div><p className="text-xl font-black">{value}</p><p className="text-xs text-neutral-500">{label}</p></div>;
}
