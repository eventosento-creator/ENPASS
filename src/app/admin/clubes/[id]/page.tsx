import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getAdminClubDetail } from "@/modules/admin/application/queries";
import { formatMoneyCompact } from "@/modules/admin/ui/format";
import { viewOrganizationAsAdmin } from "@/modules/organizations/application/admin-actions";
import { SubmitButton } from "@/shared/ui/submit-button";

const listingLabels: Record<string, string> = { approved: "Publicado en /clubes", pending: "Pidió publicarse", rejected: "Rechazado", none: "No está en el listado público" };

export default async function AdminClubDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const detail = await getAdminClubDetail(id);
  if (!detail) notFound();
  const { club } = detail;
  const upToDate = detail.members_active > 0 ? Math.round(((detail.members_active - detail.members_overdue) / detail.members_active) * 100) : null;
  const maxBilled = Math.max(1, ...detail.months.map((month) => month.billed));
  return <>
    <Link href={"/admin/clubes" as never} className="inline-flex min-h-11 items-center gap-1 text-sm text-neutral-500"><ChevronLeft size={16}/>Clubes</Link>
    <header className="mt-1 flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="page-title">{club.name}</h1><p className="mt-2 text-sm text-neutral-500">{listingLabels[club.listing_status ?? "none"] ?? "—"} · cobra {club.collection_mode === "enpass" ? "ENPASS" : "el club"} · cargo de cuotas {(club.dues_fee_bps / 100).toLocaleString("es-AR")}%</p></div>
      <div className="flex flex-wrap gap-2">
        <Link className="btn btn-secondary" href={`/admin/eventos?org=${club.id}` as never}>Ver sus eventos ({detail.events_total})</Link>
        <form action={viewOrganizationAsAdmin}><input type="hidden" name="organizationId" value={club.id}/><SubmitButton className="btn btn-secondary" pendingLabel="Abriendo…">Ver su panel</SubmitButton></form>
      </div>
    </header>

    <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Números del club">
      <Stat label="Socios activos" value={detail.members_active.toLocaleString("es-AR")} note={detail.members_suspended ? `${detail.members_suspended} suspendidos` : "ninguno suspendido"}/>
      <Stat label="Socios al día" value={upToDate === null ? "—" : `${upToDate}%`} note={`${detail.members_overdue} con cuota vencida`}/>
      <Stat label="Deuda vencida" value={formatMoneyCompact(detail.overdue_amount)} note="cuotas impagas"/>
      <Stat label="Pedidos de ingreso" value={String(detail.requests_pending)} note="esperando respuesta del club"/>
    </section>

    <div className="mt-5 grid gap-4 lg:grid-cols-2">
      <section className="card p-5"><h2 className="font-black">Cuotas de los últimos meses</h2>
        <div className="mt-3 grid gap-3">{detail.months.map((month) => <div key={month.month}><div className="flex justify-between text-xs"><span className="font-bold">{month.month}</span><span className="text-neutral-500">{formatMoneyCompact(month.collected)} de {formatMoneyCompact(month.billed)}</span></div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--surface-strong)]"><div className="h-full rounded-full bg-[#1D9E75]" style={{ width: `${Math.min(100, (month.collected / maxBilled) * 100)}%` }}/></div></div>)}
          {!detail.months.length && <p className="text-sm text-neutral-500">Todavía no hay cuotas generadas.</p>}</div></section>
      <section className="card p-5"><h2 className="font-black">Socios por categoría</h2>
        <div className="mt-2 divide-y divide-[var(--border)]">{detail.by_category.map((category) => <div key={category.name} className="flex items-center justify-between py-2.5 text-sm"><span>{category.name}</span><b>{category.members}</b></div>)}
          {!detail.by_category.length && <p className="py-3 text-sm text-neutral-500">Sin categorías.</p>}</div>
        <p className="mt-3 text-xs text-neutral-500">{club.has_payout_details ? "El club cargó sus datos para recibir liquidaciones." : "El club todavía no cargó datos para recibir liquidaciones."}{club.debt_blocks_entry ? " La deuda bloquea el ingreso." : ""}</p></section>
    </div>
  </>;
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="card p-4"><p className="text-xs font-bold text-neutral-500">{label}</p><p className="mt-1 text-2xl font-black tracking-[-.02em]">{value}</p><p className="mt-1 text-xs text-neutral-500">{note}</p></div>;
}
