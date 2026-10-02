import { Receipt } from "lucide-react";
import { formatMoney } from "@/shared/lib/format";
import type { MembershipDue } from "../domain/club";

export type PaymentHistoryEntry = { concept: string; due: MembershipDue };

const methodLabels: Record<string, string> = { cash: "Efectivo", transfer: "Transferencia", other: "Otro", mercado_pago: "Mercado Pago" };
const TIME_ZONE = "America/Argentina/Buenos_Aires";

const periodLabel = (period: string) => new Date(`${period}T00:00:00`).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
const paidLabel = (paidAt: string) => new Date(paidAt).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: TIME_ZONE });

/** Pagos registrados del socio (cuota de socio + divisiones), del más reciente al más antiguo. */
export function PaymentHistory({ entries, currency, description = "Todo lo que pagó este socio: cuota del club y divisiones." }: { entries: PaymentHistoryEntry[]; currency: string; description?: string }) {
  const paid = entries
    .filter((entry): entry is PaymentHistoryEntry & { due: MembershipDue & { paidAt: string } } => Boolean(entry.due.paidAt))
    .sort((a, b) => b.due.paidAt.localeCompare(a.due.paidAt));
  const total = paid.reduce((sum, entry) => sum + (entry.due.paidAmount ?? entry.due.amount), 0);
  const pending = entries.filter((entry) => !entry.due.paidAt && entry.due.status !== "paid");
  const debt = pending.filter((entry) => entry.due.status === "overdue").reduce((sum, entry) => sum + entry.due.amount, 0);

  return <section className="card mt-6 p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="flex items-center gap-2 text-lg font-bold"><Receipt size={18}/>Historial de pagos</h2><p className="mt-1 text-sm text-neutral-500">{description}</p></div>
      <div className="flex gap-5 text-right">
        <div><p className="text-xs font-bold uppercase tracking-wider text-neutral-600">Total pagado</p><p className="text-xl font-black">{formatMoney(total, currency)}</p></div>
        {debt > 0 && <div><p className="text-xs font-bold uppercase tracking-wider text-neutral-600">Deuda vencida</p><p className="text-xl font-black text-red-500">{formatMoney(debt, currency)}</p></div>}
      </div>
    </div>
    {paid.length ? <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[34rem] text-left text-sm">
      <thead><tr className="border-b border-white/[.08] text-xs uppercase tracking-wider text-neutral-600"><th className="py-2 pr-3 font-bold">Fecha de pago</th><th className="py-2 pr-3 font-bold">Concepto</th><th className="py-2 pr-3 font-bold">Medio</th><th className="py-2 text-right font-bold">Importe</th></tr></thead>
      <tbody>{paid.map(({ concept, due }) => <tr key={due.dueId} className="border-b border-white/[.05]">
        <td className="py-3 pr-3 whitespace-nowrap">{paidLabel(due.paidAt)}</td>
        <td className="py-3 pr-3"><span className="font-semibold">{concept}</span><span className="block text-xs capitalize text-neutral-500">{periodLabel(due.period)}</span></td>
        <td className="py-3 pr-3">{methodLabels[due.paymentMethod ?? ""] ?? due.paymentMethod ?? "—"}{due.paymentReference && <span className="block text-xs text-neutral-500">{due.paymentReference}</span>}</td>
        <td className="py-3 text-right font-bold">{formatMoney(due.paidAmount ?? due.amount, currency)}</td>
      </tr>)}</tbody>
    </table></div> : <p className="mt-5 text-sm text-neutral-500">Todavía no registró ningún pago.</p>}
  </section>;
}
