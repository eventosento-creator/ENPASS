import Link from "next/link";
import { Settings2 } from "lucide-react";
import { getAdminClubs } from "@/modules/admin/application/queries";
import { formatMoneyCompact } from "@/modules/admin/ui/format";

const listingLabels: Record<string, string> = { approved: "Publicado", pending: "Pidió publicarse", rejected: "Rechazado", none: "No listado" };

export default async function AdminClubsPage() {
  const clubs = await getAdminClubs();
  const pending = clubs.filter((club) => club.listing_status === "pending").length;
  return <>
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="eyebrow">Administración</p><h1 className="page-title mt-1">Clubes</h1><p className="mt-2 text-sm text-neutral-500">Socios y cuotas de cada club. Los eventos de los clubes están en Eventos, con la etiqueta Club.</p></div>
      <Link href={"/admin/clubes/gestion" as never} className="btn btn-secondary"><Settings2 size={16}/>Gestión de clubes{pending > 0 ? ` (${pending})` : ""}</Link>
    </header>
    <div className="mt-6 overflow-x-auto rounded-2xl border border-[var(--border)]">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-[var(--surface-strong)] text-xs font-bold text-neutral-500"><tr><th className="px-4 py-3">Club</th><th className="px-4 py-3 text-right">Socios activos</th><th className="px-4 py-3 text-right">Con cuota vencida</th><th className="px-4 py-3">Listado público</th><th className="px-4 py-3">Cobra</th><th className="px-4 py-3 text-right">A pagarle</th></tr></thead>
        <tbody className="divide-y divide-[var(--border)]">
          {clubs.map((club) => <tr key={club.organization_id} className="hover:bg-[var(--surface-strong)]/50">
            <td className="px-4 py-3"><Link href={`/admin/clubes/${club.organization_id}` as never} className="font-black hover:underline">{club.club_name}</Link>{club.requests_pending > 0 && <span className="ml-2 rounded-full bg-amber-400/90 px-2 py-0.5 text-[11px] font-black text-black">{club.requests_pending} pedidos</span>}</td>
            <td className="px-4 py-3 text-right font-bold">{club.members_active.toLocaleString("es-AR")}</td>
            <td className="px-4 py-3 text-right">{club.members_overdue ? <span className="font-bold text-red-600">{club.members_overdue}</span> : <span className="text-neutral-500">0</span>}</td>
            <td className="px-4 py-3 text-neutral-500">{listingLabels[club.listing_status ?? "none"] ?? "No listado"}</td>
            <td className="px-4 py-3 text-neutral-500">{club.collection_mode === "enpass" ? "ENPASS" : "El club"}</td>
            <td className="px-4 py-3 text-right">{club.payouts_pending_amount ? formatMoneyCompact(club.payouts_pending_amount) : <span className="text-neutral-500">—</span>}</td>
          </tr>)}
          {!clubs.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-neutral-500">Todavía no hay clubes activos.</td></tr>}
        </tbody>
      </table>
    </div>
  </>;
}
