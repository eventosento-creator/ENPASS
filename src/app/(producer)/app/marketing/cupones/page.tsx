import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgePercent, Download, Plus, Receipt, Tags, Ticket, Users, Wallet } from "lucide-react";
import { getCurrentOrganization } from "@/modules/organizations/application/queries";
import { getPromotionScopeOptions, getPromotionsOverview } from "@/modules/promotions/application/queries";
import { duplicatePromotion, togglePromotionActive } from "@/modules/promotions/application/actions";
import { describeDiscount, promotionStatusLabels } from "@/modules/promotions/domain/promotions";
import { PromotionStatusBadge } from "@/modules/promotions/ui/promotion-status-badge";
import { EmptyState } from "@/shared/ui/empty-state";
import { StatCard } from "@/shared/ui/stat-card";
import { formatMoney } from "@/shared/lib/format";

type Search = { event?: string; status?: string; q?: string; from?: string; to?: string };

export default async function PromotionsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const organization = await getCurrentOrganization();
  if (!organization) redirect("/app/onboarding");
  if (!["owner", "admin"].includes(organization.role)) redirect("/app");
  const query = await searchParams;
  const toDate = query.to ? new Date(`${query.to}T23:59:59-03:00`) : null;
  const [{ rows, summary, hasAny }, scope] = await Promise.all([
    getPromotionsOverview(organization.id, {
      eventId: query.event, status: query.status, search: query.q,
      from: query.from ? new Date(`${query.from}T00:00:00-03:00`).toISOString() : undefined,
      to: toDate ? new Date(toDate.getTime() + 1000).toISOString() : undefined,
    }),
    getPromotionScopeOptions(organization.id),
  ]);
  const money = (centavos: number) => formatMoney(centavos, organization.default_currency);
  const filtered = Boolean(query.event || query.status || query.q || query.from || query.to);
  const exportQuery = new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => Boolean(entry[1]))).toString();

  return <>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="eyebrow">Marketing</p><h1 className="page-title mt-2">Cupones y promociones</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-500">Creá códigos de descuento para tus eventos. El descuento lo asumís vos; el cargo por servicio de ENPASS no cambia.</p></div>
      <div className="flex flex-wrap gap-2">
        {hasAny && <a className="btn btn-secondary" href={`/app/marketing/cupones/export?kind=promotions${exportQuery ? `&${exportQuery}` : ""}`}><Download size={16}/>Exportar CSV</a>}
        <Link className="btn btn-primary" href={"/app/marketing/cupones/nuevo" as never}><Plus size={16}/>Nuevo cupón</Link>
      </div>
    </div>

    {hasAny && <section aria-label="Resumen" className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      <StatCard icon={BadgePercent} tone="neutral" label="Cupones activos" value={String(summary.active_promotions)}/>
      <StatCard icon={Receipt} tone="neutral" label="Usos confirmados" value={String(summary.uses_confirmed)} sublabel="Compras pagas con cupón"/>
      <StatCard icon={Ticket} tone="neutral" label="Entradas con descuento" value={String(summary.tickets_benefited)}/>
      <StatCard icon={Tags} tone="neutral" label="Total descontado" value={money(summary.discount_amount)} sublabel="Lo que asumiste vos"/>
      <StatCard icon={Wallet} tone="neutral" label="Ventas con cupón" value={money(summary.sales_amount)} sublabel="Ya con el descuento"/>
      <StatCard icon={Users} tone="neutral" label="Compradores" value={String(summary.buyers)}/>
    </section>}

    {hasAny && <form method="get" className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_1fr_1fr_auto]" aria-label="Filtros">
      <input className="field" type="search" name="q" defaultValue={query.q} placeholder="Buscar código o nombre" aria-label="Buscar"/>
      <select className="field" name="event" defaultValue={query.event ?? ""} aria-label="Evento"><option value="">Todos los eventos</option>{scope.events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}</select>
      <select className="field" name="status" defaultValue={query.status ?? ""} aria-label="Estado"><option value="">Todos los estados</option>{Object.entries(promotionStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <input className="field" type="date" name="from" defaultValue={query.from} aria-label="Usos desde"/>
      <input className="field" type="date" name="to" defaultValue={query.to} aria-label="Usos hasta"/>
      <div className="flex gap-2"><button className="btn btn-secondary" type="submit">Filtrar</button>{filtered && <Link className="btn btn-ghost" href={"/app/marketing/cupones" as never}>Limpiar</Link>}</div>
    </form>}

    <div className="mt-6">
      {!hasAny ? <EmptyState icon={BadgePercent} title="Todavía no creaste cupones" description="Armá un código como ELIAS20 y compartilo: el comprador lo escribe en el checkout y ve el descuento antes de pagar." action={<Link className="btn btn-primary" href={"/app/marketing/cupones/nuevo" as never}>Crear mi primer cupón</Link>}/>
        : rows.length === 0 ? <EmptyState icon={BadgePercent} title="No hay cupones con esos filtros" description="Probá con otro evento, estado o período."/>
        : <div className="grid gap-3">
          <div className="hidden grid-cols-[1.4fr_1fr_.8fr_1fr_1fr_.8fr_auto] gap-4 px-5 text-[11px] font-bold uppercase tracking-wider text-neutral-600 lg:grid"><span>Código</span><span>Descuento</span><span>Usos</span><span>Ventas</span><span>Ahorro otorgado</span><span>Estado</span><span className="w-44"/></div>
          {rows.map((row) => {
            const limit = row.max_total_uses;
            const rate = limit ? Math.min(100, Math.round(((row.uses_confirmed + row.uses_pending) / limit) * 100)) : null;
            return <article key={row.id} className="card grid gap-3 p-4 sm:p-5 lg:grid-cols-[1.4fr_1fr_.8fr_1fr_1fr_.8fr_auto] lg:items-center lg:gap-4">
              <div className="min-w-0"><Link href={`/app/marketing/cupones/${row.id}` as never} className="font-mono text-base font-black hover:underline">{row.code}</Link><p className="truncate text-xs text-neutral-500">{row.name}{row.all_events ? " · Todos los eventos" : ""}</p></div>
              <p className="text-sm"><span className="text-xs text-neutral-500 lg:hidden">Descuento · </span>{describeDiscount(row, money)}</p>
              <div className="text-sm"><span className="text-xs text-neutral-500 lg:hidden">Usos · </span>{row.uses_confirmed}{limit ? `/${limit}` : ""}{row.uses_pending > 0 && <span className="text-xs text-amber-500"> (+{row.uses_pending} en curso)</span>}{rate !== null && <div className="mt-1.5 h-1 w-full max-w-24 overflow-hidden rounded-full bg-[var(--border)]" role="progressbar" aria-valuenow={rate} aria-valuemin={0} aria-valuemax={100} aria-label="Uso del límite"><div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${rate}%` }}/></div>}</div>
              <p className="text-sm font-semibold"><span className="text-xs font-normal text-neutral-500 lg:hidden">Ventas · </span>{money(row.sales_amount)}</p>
              <p className="text-sm font-semibold"><span className="text-xs font-normal text-neutral-500 lg:hidden">Ahorro · </span>{money(row.discount_amount)}</p>
              <div><PromotionStatusBadge status={row.status}/></div>
              <div className="flex flex-wrap items-center gap-1.5 lg:w-44 lg:justify-end">
                <Link className="btn btn-secondary min-h-9 px-3 text-xs" href={`/app/marketing/cupones/${row.id}` as never}>Ver</Link>
                <Link className="btn btn-ghost min-h-9 px-3 text-xs" href={`/app/marketing/cupones/${row.id}/editar` as never}>Editar</Link>
                <form action={togglePromotionActive}><input type="hidden" name="id" value={row.id}/><input type="hidden" name="active" value={String(!row.active)}/><button className="btn btn-ghost min-h-9 px-3 text-xs" type="submit">{row.active ? "Desactivar" : "Activar"}</button></form>
                <form action={duplicatePromotion}><input type="hidden" name="id" value={row.id}/><button className="btn btn-ghost min-h-9 px-3 text-xs" type="submit">Duplicar</button></form>
              </div>
            </article>;
          })}
        </div>}
    </div>
  </>;
}
