import { formatMoney } from "@/shared/lib/format";
import type { OrgReport } from "../domain/report";
import { reportColors } from "./colors";
import { CardEmpty, ReportCard } from "./report-card";

export function TicketTypesCard({ report, currency }: { report: OrgReport; currency: string }) {
  const tables = report.origin.find((row) => row.key === "tables");
  const courtesy = report.kpis.courtesy_tickets;
  const rows = report.ticket_types;
  const empty = !rows.length && !tables && !courtesy;
  return <ReportCard title="Entradas por tipo">
    {empty ? <CardEmpty text="Todavía no hay entradas emitidas en este período."/> : <div className="-mx-5 overflow-x-auto px-5"><table className="w-full min-w-[28rem] text-left text-sm">
      <thead><tr className="border-b border-[var(--border)] text-xs font-semibold text-[var(--muted)]"><th className="pb-2.5 font-semibold">Tipo</th><th className="pb-2.5 text-right font-semibold">Vendidas</th><th className="pb-2.5 text-right font-semibold">Disponibles</th><th className="pb-2.5 pl-4 font-semibold">%</th><th className="pb-2.5 text-right font-semibold">Facturación</th></tr></thead>
      <tbody>
        {rows.map((row) => { const pct = row.quantity > 0 ? Math.min((row.issued / row.quantity) * 100, 100) : 0; return <tr key={row.name} className="border-b border-[var(--border)] last:border-0">
          <td className="py-3 pr-3 font-bold">{row.name}</td>
          <td className="py-3 text-right tabular-nums">{row.sold.toLocaleString("es-AR")}</td>
          <td className="py-3 text-right tabular-nums text-[var(--text-secondary)]">{Math.max(row.quantity - row.issued, 0).toLocaleString("es-AR")}</td>
          <td className="py-3 pl-4"><div className="flex items-center gap-2"><span className="w-9 text-xs font-bold tabular-nums">{Math.round(pct)}%</span><span className="h-1.5 w-14 overflow-hidden rounded-full bg-[var(--surface-strong)]"><span className="block h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 90 ? reportColors.box_office : reportColors.growth }}/></span></div></td>
          <td className="py-3 text-right font-bold tabular-nums">{formatMoney(row.revenue, currency)}</td></tr>; })}
        {tables && <tr className="border-b border-[var(--border)]"><td className="py-3 pr-3 font-bold">Mesas</td><td className="py-3 text-right tabular-nums">{tables.units.toLocaleString("es-AR")}</td><td className="py-3 text-right text-[var(--muted)]">—</td><td className="py-3 pl-4 text-[var(--muted)]">—</td><td className="py-3 text-right font-bold tabular-nums">{formatMoney(tables.revenue, currency)}</td></tr>}
        {courtesy > 0 && <tr><td className="py-3 pr-3 font-bold">Cortesías</td><td className="py-3 text-right tabular-nums">{courtesy.toLocaleString("es-AR")}</td><td className="py-3 text-right text-[var(--muted)]">—</td><td className="py-3 pl-4 text-[var(--muted)]">—</td><td className="py-3 text-right font-bold tabular-nums">{formatMoney(0, currency)}</td></tr>}
      </tbody></table></div>}
  </ReportCard>;
}
