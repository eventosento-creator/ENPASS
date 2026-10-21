import Link from "next/link";
import { getAdminProducers } from "@/modules/admin/application/queries";
import { formatMoneyCompact } from "@/modules/admin/ui/format";
import { viewOrganizationAsAdmin } from "@/modules/organizations/application/admin-actions";
import { setTicketTransfer } from "@/modules/payments/application/transfer-admin-actions";
import { SubmitButton } from "@/shared/ui/submit-button";

export default async function AdminProducersPage() {
  const producers = await getAdminProducers();
  return <>
    <header><p className="eyebrow">Administración</p><h1 className="page-title mt-1">Productores</h1><p className="mt-2 text-sm text-neutral-500">Todas las cuentas de la plataforma, productores y clubes. Desde acá entrás a ver su panel o activás la transferencia.</p></header>
    <div className="mt-6 overflow-x-auto rounded-2xl border border-[var(--border)]">
      <table className="w-full min-w-[860px] text-left text-sm">
        <thead className="bg-[var(--surface-strong)] text-xs font-bold text-neutral-500"><tr><th className="px-4 py-3">Cuenta</th><th className="px-4 py-3 text-right">Eventos</th><th className="px-4 py-3 text-right">Ventas</th><th className="px-4 py-3 text-right">Cargo ENPASS</th><th className="px-4 py-3">Mercado Pago</th><th className="px-4 py-3 text-right">Le debés</th><th className="px-4 py-3">Transferencia</th><th className="px-4 py-3"><span className="sr-only">Acciones</span></th></tr></thead>
        <tbody className="divide-y divide-[var(--border)]">
          {producers.map((producer) => <tr key={producer.organization_id} className="hover:bg-[var(--surface-strong)]/50">
            <td className="px-4 py-3"><Link href={(producer.is_club ? `/admin/clubes/${producer.organization_id}` : `/admin/eventos?org=${producer.organization_id}`) as never} className="font-black hover:underline">{producer.organization_name}</Link>{producer.is_club && <span className="ml-2 rounded-full bg-[var(--bg-accent,#e6f1fb)] px-2 py-0.5 text-[11px] font-bold text-[var(--text-accent,#185fa5)]">Club</span>}</td>
            <td className="px-4 py-3 text-right">{producer.events_total}{producer.events_upcoming ? <span className="text-neutral-500"> ({producer.events_upcoming} activos)</span> : null}</td>
            <td className="px-4 py-3 text-right font-bold">{formatMoneyCompact(producer.sales_amount)}</td>
            <td className="px-4 py-3 text-right">{formatMoneyCompact(producer.fee_amount)}</td>
            <td className="px-4 py-3 text-neutral-500">{producer.mp_connected ? "Conectado" : "No conectado"}</td>
            <td className="px-4 py-3 text-right">{producer.owed_amount ? <b>{formatMoneyCompact(producer.owed_amount)}</b> : <span className="text-neutral-500">—</span>}</td>
            <td className="px-4 py-3"><form action={setTicketTransfer} className="flex items-center gap-2"><input type="hidden" name="organizationId" value={producer.organization_id}/><input type="hidden" name="enabled" value={producer.transfer_enabled ? "false" : "true"}/>
              <span className="text-neutral-500">{producer.transfer_enabled ? "Activada" : "Apagada"}</span><SubmitButton className="btn btn-ghost min-h-9 px-3 text-xs" pendingLabel="…">{producer.transfer_enabled ? "Apagar" : "Activar"}</SubmitButton></form></td>
            <td className="px-4 py-3 text-right"><form action={viewOrganizationAsAdmin}><input type="hidden" name="organizationId" value={producer.organization_id}/><SubmitButton className="btn btn-secondary min-h-9 px-3 text-xs" pendingLabel="Abriendo…">Ver panel</SubmitButton></form></td>
          </tr>)}
          {!producers.length && <tr><td colSpan={8} className="px-4 py-8 text-center text-neutral-500">Todavía no hay cuentas.</td></tr>}
        </tbody>
      </table>
    </div>
  </>;
}
