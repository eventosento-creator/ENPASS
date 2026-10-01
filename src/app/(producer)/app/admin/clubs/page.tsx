import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { getPendingClubListings, isPlatformAdmin } from "@/modules/organizations/application/queries";
import { reviewClubListing } from "@/modules/organizations/application/admin-actions";
import { SubmitButton } from "@/shared/ui/submit-button";

export default async function AdminClubsPage() {
  if (!(await isPlatformAdmin())) notFound();
  const pending = await getPendingClubListings();
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
  </>;
}
