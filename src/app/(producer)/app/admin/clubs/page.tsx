import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { getAdminClubs, getPendingClubListings, isPlatformAdmin } from "@/modules/organizations/application/queries";
import { reviewClubListing, setClubDuesFee } from "@/modules/organizations/application/admin-actions";
import { formatMoney } from "@/shared/lib/format";
import { SubmitButton } from "@/shared/ui/submit-button";

export default async function AdminClubsPage() {
  if (!(await isPlatformAdmin())) notFound();
  const [pending, clubs] = await Promise.all([getPendingClubListings(), getAdminClubs()]);
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
      </div>)}
      {!clubs.length && <p className="text-sm text-neutral-500">Todavía no hay clubes habilitados.</p>}
    </div>
  </>;
}
