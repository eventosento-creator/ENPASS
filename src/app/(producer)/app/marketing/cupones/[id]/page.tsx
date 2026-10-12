import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { getCurrentOrganization } from "@/modules/organizations/application/queries";
import { getPromotion, getPromotionOverviewRow, getPromotionScopeOptions, getPromotionTimeline, listPromotionRedemptions } from "@/modules/promotions/application/queries";
import { duplicatePromotion, togglePromotionActive } from "@/modules/promotions/application/actions";
import { describeDiscount, promotionKinds, redemptionStatusLabels } from "@/modules/promotions/domain/promotions";
import { PromotionStatusBadge, RedemptionStatusBadge } from "@/modules/promotions/ui/promotion-status-badge";
import { EmptyState } from "@/shared/ui/empty-state";
import { StatCard } from "@/shared/ui/stat-card";
import { formatMoney } from "@/shared/lib/format";
import { BadgePercent, Receipt, Tags, Ticket, Users, Wallet } from "lucide-react";

export default async function PromotionDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const organization = await getCurrentOrganization();
  if (!organization) redirect("/app/onboarding");
  if (!["owner", "admin"].includes(organization.role)) redirect("/app");
  const [found, row, timeline, redemptions, scope] = await Promise.all([
    getPromotion(organization.id, id), getPromotionOverviewRow(organization.id, id), getPromotionTimeline(organization.id, id),
    listPromotionRedemptions(organization.id, { promotionId: id, status: query.status, limit: 200 }), getPromotionScopeOptions(organization.id),
  ]);
  if (!found || !row) notFound();
  const { promotion } = found;
  const money = (centavos: number) => formatMoney(centavos, organization.default_currency);
  const kindLabel = promotionKinds.find((kind) => kind.value === promotion.kind)?.label ?? promotion.kind;
  const scopeText = promotion.all_events ? "Todos tus eventos" : found.eventIds.map((eventId) => scope.events.find((event) => event.id === eventId)?.name ?? "Evento").join(", ") || "Sin eventos";
  const typeNames = found.ticketTypeIds.map((typeId) => scope.ticketTypes.find((type) => type.id === typeId)?.name).filter(Boolean).join(", ");
  const limit = promotion.max_total_uses;
  const used = row.uses_confirmed + row.uses_pending;
  const rate = limit ? Math.min(100, Math.round((used / limit) * 100)) : null;
  const dateText = (value: string | null) => value ? new Date(value).toLocaleString("es-AR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Argentina/Mendoza" }) : null;
  const maxUses = Math.max(1, ...timeline.map((point) => point.uses));

  return <>
    <Link href={"/app/marketing/cupones" as never} className="inline-flex items-center gap-2 text-sm font-bold text-neutral-500 hover:text-white"><ArrowLeft size={16}/>Cupones y promociones</Link>
    <div className="mt-7 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0"><p className="eyebrow">{promotion.kind === "free" ? `Cortesía · hasta ${promotion.max_tickets_benefited ?? 1} ${promotion.max_tickets_benefited === 1 ? "entrada" : "entradas"} por compra` : `${kindLabel} · ${describeDiscount(promotion, money)}`}</p><h1 className="mt-2 flex flex-wrap items-center gap-3 font-mono text-4xl font-black tracking-tight sm:text-5xl">{promotion.code}<PromotionStatusBadge status={row.status}/></h1><p className="mt-3 text-neutral-500">{promotion.name}{promotion.description ? ` · ${promotion.description}` : ""}</p></div>
      <div className="flex flex-wrap gap-2">
        <Link className="btn btn-secondary" href={`/app/marketing/cupones/${id}/editar` as never}>Editar</Link>
        <form action={togglePromotionActive}><input type="hidden" name="id" value={id}/><input type="hidden" name="active" value={String(!promotion.active)}/><button className="btn btn-ghost" type="submit">{promotion.active ? "Desactivar" : "Activar"}</button></form>
        <form action={duplicatePromotion}><input type="hidden" name="id" value={id}/><button className="btn btn-ghost" type="submit">Duplicar</button></form>
      </div>
    </div>

    <section aria-label="Estadísticas" className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard icon={Receipt} tone="neutral" label="Usos confirmados" value={limit ? `${row.uses_confirmed}/${limit}` : String(row.uses_confirmed)} sublabel={rate !== null ? `${rate}% del límite (con las compras en curso)` : "Sin límite"}/>
      <StatCard icon={BadgePercent} tone="neutral" label="En curso / reembolsados" value={`${row.uses_pending} / ${row.uses_refunded}`} sublabel="Pagos pendientes · compras devueltas"/>
      <StatCard icon={Ticket} tone="neutral" label="Entradas con descuento" value={String(row.tickets_benefited)}/>
      <StatCard icon={Users} tone="neutral" label="Compradores" value={String(row.buyers)}/>
      <StatCard icon={Tags} tone="neutral" label="Ahorro otorgado" value={money(row.discount_amount)} sublabel="Lo asumió el productor"/>
      <StatCard icon={Wallet} tone="neutral" label="Ventas con este cupón" value={money(row.sales_amount)} sublabel="Ya con el descuento"/>
    </section>

    <section className="card mt-6 grid gap-3 p-5 text-sm sm:grid-cols-2 sm:p-6">
      <div><p className="text-xs font-bold uppercase tracking-wider text-neutral-600">Dónde vale</p><p className="mt-1">{scopeText}{typeNames ? ` · ${typeNames}` : " · todas las entradas"}</p></div>
      <div><p className="text-xs font-bold uppercase tracking-wider text-neutral-600">Vigencia</p><p className="mt-1">{dateText(promotion.starts_at) ? `Desde ${dateText(promotion.starts_at)}` : "Desde ya"}{dateText(promotion.ends_at) ? ` hasta ${dateText(promotion.ends_at)}` : ", sin fecha de fin"}</p></div>
      <div><p className="text-xs font-bold uppercase tracking-wider text-neutral-600">Límites</p><p className="mt-1">{[limit ? `${limit} usos en total` : null, promotion.max_uses_per_buyer ? `${promotion.max_uses_per_buyer} por comprador` : null, promotion.max_tickets_benefited ? `hasta ${promotion.max_tickets_benefited} entradas por compra` : null, promotion.min_tickets > 1 ? `mínimo ${promotion.min_tickets} entradas` : null, promotion.max_discount_amount ? `tope ${money(promotion.max_discount_amount)} por compra` : null].filter(Boolean).join(" · ") || "Sin límites"}</p></div>
      <div><p className="text-xs font-bold uppercase tracking-wider text-neutral-600">Cargo de servicio</p><p className="mt-1 text-neutral-500">{promotion.kind === "free" ? "No se cobra: se emite como cortesía." : "No cambia: se calcula sobre el precio original."}</p></div>
    </section>

    <section className="card mt-6 p-5 sm:p-6">
      <h2 className="text-lg font-black">Usos por día</h2>
      {timeline.length === 0 ? <p className="mt-3 text-sm text-neutral-500">Todavía no hay usos confirmados.</p> : <ol className="mt-4 grid gap-2" aria-label="Usos confirmados por día">
        {timeline.map((point) => <li key={point.day} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 text-sm">
          <span className="text-neutral-500">{new Date(`${point.day}T12:00:00`).toLocaleDateString("es-AR", { day: "numeric", month: "short" })}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-[var(--border)]"><span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.max(4, (point.uses / maxUses) * 100)}%` }}/></span>
          <span className="font-semibold">{point.uses} {point.uses === 1 ? "uso" : "usos"}</span>
        </li>)}
      </ol>}
    </section>

    <section className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-black">Historial de utilización</h2>
        <div className="flex flex-wrap items-center gap-2">
          {["", "confirmed", "reserved", "refunded", "released"].map((status) => <Link key={status || "all"} href={`/app/marketing/cupones/${id}${status ? `?status=${status}` : ""}` as never} aria-current={(query.status ?? "") === status ? "true" : undefined} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${(query.status ?? "") === status ? "border-[var(--accent)] bg-[var(--accent)]/10" : "border-[var(--border)] text-neutral-500"}`}>{status ? redemptionStatusLabels[status] : "Todos"}</Link>)}
          <a className="btn btn-secondary min-h-9 px-3 text-xs" href={`/app/marketing/cupones/export?kind=redemptions&promotion=${id}${query.status ? `&status=${query.status}` : ""}`}><Download size={14}/>CSV</a>
        </div>
      </div>
      <div className="mt-4">{redemptions.length === 0 ? <EmptyState icon={Receipt} title="Todavía no hay compras con este cupón" description="Cuando alguien lo use en el checkout va a aparecer acá, primero como reservado y después confirmado al pagar."/> : <div className="card overflow-x-auto">
        <table className="w-full min-w-[44rem] text-left text-sm"><thead className="text-[11px] font-bold uppercase tracking-wider text-neutral-600"><tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Comprador</th><th className="px-4 py-3">Evento</th><th className="px-4 py-3 text-right">Entradas</th><th className="px-4 py-3 text-right">Descuento</th><th className="px-4 py-3 text-right">Total pagado</th><th className="px-4 py-3">Estado</th></tr></thead>
          <tbody className="divide-y divide-[var(--border)]">{redemptions.map((item) => <tr key={item.redemption_id}>
            <td className="whitespace-nowrap px-4 py-3 text-neutral-500">{new Date(item.created_at).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Argentina/Mendoza" })}</td>
            <td className="px-4 py-3"><span className="block font-semibold">{item.buyer_name || "—"}</span><span className="block text-xs text-neutral-500">{item.buyer_email}</span></td>
            <td className="px-4 py-3">{item.event_name}</td>
            <td className="px-4 py-3 text-right">{item.tickets_benefited}</td>
            <td className="px-4 py-3 text-right font-semibold">−{money(item.discount_amount)}</td>
            <td className="px-4 py-3 text-right">{item.order_total_amount === 0 ? "Gratis" : money(item.order_total_amount)}</td>
            <td className="px-4 py-3"><RedemptionStatusBadge status={item.status}/></td>
          </tr>)}</tbody></table>
      </div>}</div>
    </section>
  </>;
}
