import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { getAdminClubs, getClubSettlementSummary, getPendingClubListings, getRecentClubPayouts, isPlatformAdmin } from "@/modules/organizations/application/queries";
import { cancelClubPayout, createClubPayout, markClubPayoutPaid, reviewClubListing, setClubCollectionMode, setClubDuesFee } from "@/modules/organizations/application/admin-actions";
import { formatMoney } from "@/shared/lib/format";
import { SubmitButton } from "@/shared/ui/submit-button";

export default async function AdminClubsPage() {
  if (!(await isPlatformAdmin())) notFound();
  const [pending, clubs, settlements, payouts] = await Promise.all([getPendingClubListings(), getAdminClubs(), getClubSettlementSummary(), getRecentClubPayouts()]);
  const modeByOrg = new Map(settlements.map((row) => [row.organizationId, row]));
  return <>
    <header className="flex items-center gap-2"><ShieldCheck className="text-[var(--accent)]" size={22}/><h1 className="page-title">Clubes pendientes de publicar</h1></header>
    <p className="mt-2 text-sm text-neutral-500">Revisá antes de que aparezcan en enpass.com.ar/clubes.</p>
    <div className="mt-8 grid gap-3">
      {pending.map((club) => <div key={club.organizationId} className="card grid gap-3 p-4">
        <div className="flex items-center justify-between gap-4">
          <div><p className="font-bold">{club.name}</p><p className="text-xs text-neutral-500">{club.slug} · pedido {club.requestedAt ? new Date(club.requestedAt).toLocaleDateString("es-AR") : "—"}</p></div>
        </div>
        {club.description && <p className="text-sm text-neutral-300">{club.description}</p>}
        <div className="flex flex-wrap gap-2">
          <form action={reviewClubListing}>
            <input type="hidden" name="organizationId" value={club.organizationId}/>
            <input type="hidden" name="approve" value="true"/>
            <SubmitButton className="btn btn-primary">Aprobar</SubmitButton>
          </form>
          <form action={reviewClubListing} className="flex items-end gap-2">
            <input type="hidden" name="organizationId" value={club.organizationId}/>
            <input type="hidden" name="approve" value="false"/>
            <input className="field" name="rejectionReason" placeholder="Motivo del rechazo (opcional)"/>
            <SubmitButton className="btn btn-ghost text-red-400">Rechazar</SubmitButton>
          </form>
        </div>
      </div>)}
      {!pending.length && <p className="text-sm text-neutral-500">No hay clubes esperando revisión.</p>}
    </div>

    <h2 className="mt-12 text-xl font-black">Cargo de servicio en cuotas</h2>
    <p className="mt-2 max-w-2xl text-sm text-neutral-500">Porcentaje que paga la familia arriba de cada cuota online. El club recibe su cuota completa; ENPASS cubre el costo de Mercado Pago. 0 = sin cargo.</p>
    <div className="mt-6 grid gap-3">
      {clubs.map((club) => <div key={club.organizationId} className="card grid gap-4 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <p className="font-bold">{club.name} <span className="text-xs font-normal text-neutral-500">/clubes/{club.slug}</span></p>
          <p className="mt-1 text-xs text-neutral-500">Cobrado online: {formatMoney(club.collected)} · Cargo de servicio: {formatMoney(club.serviceFee)} · <b className="text-neutral-300">Comisión de Mercado Pago a reintegrar al club: {formatMoney(club.processorFee)}</b></p>
        </div>
        <form action={setClubDuesFee} className="flex items-end gap-2">
          <input type="hidden" name="organizationId" value={club.organizationId}/>
          <label className="label">Cargo (%)<input className="field w-24" name="percent" inputMode="decimal" defaultValue={String(club.feeBps / 100).replace(".", ",")} required/></label>
          <SubmitButton className="btn btn-secondary">Guardar</SubmitButton>
        </form>
        <form action={setClubCollectionMode} className="flex items-end gap-2 sm:col-span-2 sm:justify-end">
          <input type="hidden" name="organizationId" value={club.organizationId}/>
          <label className="label">Quién cobra las cuotas<select className="field" name="mode" defaultValue={modeByOrg.get(club.organizationId)?.mode ?? "club_account"}><option value="club_account">El club (su Mercado Pago)</option><option value="enpass">ENPASS (liquidación mensual)</option></select></label>
          <SubmitButton className="btn btn-secondary">Guardar</SubmitButton>
        </form>
      </div>)}
      {!clubs.length && <p className="text-sm text-neutral-500">Todavía no hay clubes habilitados.</p>}
    </div>

    <h2 className="mt-12 text-xl font-black">Liquidaciones a clubes</h2>
    <p className="mt-2 max-w-2xl text-sm text-neutral-500">Para los clubes donde <b>cobra ENPASS</b>: el pago entra a tu cuenta de Mercado Pago y a fin de mes le entregás al club la cuota completa. Generá la liquidación, hacé la transferencia y registrala. <span className="text-neutral-600">(La transferencia automática con BIND se suma más adelante.)</span></p>
    <div className="mt-6 grid gap-3">
      {settlements.filter((row) => row.mode === "enpass").map((row) => <div key={row.organizationId} className="card grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <p className="font-bold">{row.name}</p>
          <p className="mt-1 text-sm text-neutral-300">A entregar al club: <b>{formatMoney(row.owed)}</b> <span className="text-neutral-500">({row.payments} {row.payments === 1 ? "pago" : "pagos"})</span></p>
          <p className="mt-0.5 text-xs text-neutral-500">Cargo de servicio cobrado: {formatMoney(row.serviceFee)} · Comisión de Mercado Pago: {formatMoney(row.processorFee)} · <b className="text-neutral-300">Te queda: {formatMoney(row.serviceFee - row.processorFee)}</b></p>
          {!row.hasPayoutDetails && <p className="mt-1 text-xs font-bold text-amber-500">El club todavía no cargó su alias o CBU.</p>}
        </div>
        <form action={createClubPayout}><input type="hidden" name="organizationId" value={row.organizationId}/><SubmitButton className="btn btn-primary">Generar liquidación</SubmitButton></form>
      </div>)}
      {!settlements.some((row) => row.mode === "enpass") && <p className="text-sm text-neutral-500">Ningún club está en modalidad “ENPASS cobra”.</p>}
    </div>
    {payouts.length > 0 && <div className="mt-8 grid gap-3">
      <h3 className="text-sm font-black uppercase tracking-[.1em] text-neutral-500">Historial</h3>
      {payouts.map((payout) => <div key={payout.id} className="card grid gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-bold">{payout.club} · {formatMoney(payout.amount)}</p><p className="text-xs text-neutral-500">{new Date(payout.createdAt).toLocaleDateString("es-AR")} · {payout.payments} {payout.payments === 1 ? "pago" : "pagos"} · cargo {formatMoney(payout.serviceFee)} · MP {formatMoney(payout.processorFee)}</p></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${payout.status === "paid" ? "status-success" : "text-amber-500"}`}>{payout.status === "paid" ? `Entregada${payout.reference ? ` · ${payout.reference}` : ""}` : "Pendiente de transferir"}</span></div>
        {payout.status === "pending" && <>
          <div className="rounded-xl bg-white/[.03] p-3 text-xs text-neutral-300"><p className="font-bold text-neutral-400">Transferir a:</p><p>Titular: {payout.destination.holder ?? "—"} · CUIT: {payout.destination.cuit ?? "—"}</p><p>Alias: {payout.destination.alias ?? "—"} · CBU/CVU: {payout.destination.cbu ?? "—"}</p></div>
          <div className="flex flex-wrap gap-2">
            <form action={markClubPayoutPaid} className="flex items-end gap-2"><input type="hidden" name="payoutId" value={payout.id}/><input className="field" name="reference" placeholder="Comprobante / n° de transferencia"/><SubmitButton className="btn btn-primary">Marcar como transferida</SubmitButton></form>
            <form action={cancelClubPayout}><input type="hidden" name="payoutId" value={payout.id}/><SubmitButton className="btn btn-ghost text-red-400">Cancelar</SubmitButton></form>
          </div>
        </>}
      </div>)}
    </div>}
  </>;
}
