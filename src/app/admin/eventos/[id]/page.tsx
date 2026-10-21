import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getAdminEventDetail } from "@/modules/admin/application/queries";
import { formatMoneyCompact } from "@/modules/admin/ui/format";
import { formatEventDate } from "@/shared/lib/format";
import { formatMoney } from "@/shared/lib/format";

const methodLabels: Record<string, string> = { mercado_pago: "Mercado Pago", transferencia: "Transferencia", caja: "Caja" };
const statusLabels: Record<string, string> = { draft: "Borrador", published: "Publicado", sold_out: "Agotado", finished: "Finalizado", cancelled: "Cancelado" };

export default async function AdminEventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const detail = await getAdminEventDetail(id);
  if (!detail) notFound();
  const { event } = detail;
  const fill = event.capacity ? Math.round((detail.tickets_sold / event.capacity) * 100) : 0;
  return <>
    <Link href={"/admin/eventos" as never} className="inline-flex min-h-11 items-center gap-1 text-sm text-neutral-500"><ChevronLeft size={16}/>Eventos</Link>
    <header className="mt-1 flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="page-title">{event.name}</h1>
        <p className="mt-2 text-sm text-neutral-500">{event.organization_name}{event.is_club ? " (club)" : ""} · {formatEventDate(event.starts_at, "America/Argentina/Buenos_Aires")} · {statusLabels[event.status] ?? event.status}</p></div>
      <div className="flex gap-2"><Link className="btn btn-secondary" href={`/e/${event.slug}` as never}>Ver página pública</Link></div>
    </header>

    {detail.transfers_pending > 0 && <Link href={"/admin/transferencias" as never} className="mt-5 block rounded-xl border border-amber-400/30 bg-amber-400/[.08] p-4 text-sm font-bold">Hay {detail.transfers_pending} {detail.transfers_pending === 1 ? "transferencia" : "transferencias"} de este evento esperando tu revisión →</Link>}

    <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Números del evento">
      <Stat label="Ventas" value={formatMoneyCompact(detail.sales)} note="valor de las entradas"/>
      <Stat label="Cargo de ENPASS" value={formatMoneyCompact(detail.fees)} note={`${(event.service_fee_bps / 100).toLocaleString("es-AR")}% sobre las entradas`}/>
      <Stat label="Entradas vendidas" value={`${detail.tickets_sold}${event.capacity ? ` / ${event.capacity}` : ""}`} note={event.capacity ? `${fill}% de la capacidad` : "sin capacidad cargada"}/>
      <Stat label="Ya ingresaron" value={String(detail.tickets_used)} note={`${detail.courtesies} cortesías · ${detail.orders} compras`}/>
    </section>

    <div className="mt-5 grid gap-4 lg:grid-cols-2">
      <section className="card p-5"><h2 className="font-black">Por tipo de entrada</h2>
        <div className="mt-2 divide-y divide-[var(--border)]">{detail.by_ticket_type.map((type) => <div key={type.name} className="flex items-center justify-between gap-3 py-2.5 text-sm"><span><b>{type.name}</b><span className="ml-2 text-xs text-neutral-500">{formatMoney(type.price)}</span></span><span><b>{type.sold}</b><span className="text-neutral-500"> / {type.quantity}</span></span></div>)}
          {!detail.by_ticket_type.length && <p className="py-3 text-sm text-neutral-500">Sin tipos de entrada.</p>}</div></section>
      <section className="card p-5"><h2 className="font-black">Cobrado por medio de pago</h2>
        <div className="mt-2 divide-y divide-[var(--border)]">{detail.by_method.map((method) => <div key={method.method} className="flex items-center justify-between gap-3 py-2.5 text-sm"><span>{methodLabels[method.method] ?? method.method}<span className="ml-2 text-xs text-neutral-500">{method.orders} {method.orders === 1 ? "compra" : "compras"}</span></span><b>{formatMoney(method.amount)}</b></div>)}
          {!detail.by_method.length && <p className="py-3 text-sm text-neutral-500">Todavía no hay cobros.</p>}</div></section>
    </div>
  </>;
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="card p-4"><p className="text-xs font-bold text-neutral-500">{label}</p><p className="mt-1 text-2xl font-black tracking-[-.02em]">{value}</p><p className="mt-1 text-xs text-neutral-500">{note}</p></div>;
}
