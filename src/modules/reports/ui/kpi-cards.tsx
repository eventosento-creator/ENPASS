import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { formatMoney } from "@/shared/lib/format";
import { computeDelta, type Delta, type OrgReport } from "../domain/report";

function DeltaLine({ delta }: { delta: Delta }) {
  if (delta.direction === "new") return <p className="mt-2 text-xs font-bold text-[var(--muted)]">Sin datos del período anterior</p>;
  const Icon = delta.direction === "up" ? ArrowUpRight : delta.direction === "down" ? ArrowDownRight : Minus;
  const tone = delta.direction === "up" ? "text-emerald-500" : delta.direction === "down" ? "text-red-500" : "text-[var(--muted)]";
  const pct = delta.pct === null ? "—" : `${Math.abs(delta.pct) >= 100 ? Math.round(Math.abs(delta.pct)) : Math.abs(delta.pct).toFixed(0)}%`;
  return <p className={`mt-2 flex items-center gap-1 text-xs font-bold ${tone}`}><Icon aria-hidden size={14}/>{pct}<span className="font-medium text-[var(--muted)]">vs. período anterior</span></p>;
}

function Kpi({ label, value, delta, hint }: { label: string; value: string; delta?: Delta; hint?: string }) {
  return <div className="w-[15rem] shrink-0 snap-start rounded-[1.1rem] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-xs)] sm:w-auto">
    <p className="text-xs font-semibold text-[var(--muted)]">{label}</p>
    <p className="mt-2 text-[1.65rem] font-black leading-none tracking-[-.03em]">{value}</p>
    {delta ? <DeltaLine delta={delta}/> : <p className="mt-2 text-xs font-medium text-[var(--muted)]">{hint}</p>}
  </div>;
}

export function KpiCards({ report, currency }: { report: OrgReport; currency: string }) {
  const { current, previous, occupancy } = report.kpis;
  const avg = (totals: typeof current) => (totals.ops > 0 ? Math.round(totals.revenue / totals.ops) : 0);
  return <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 xl:grid-cols-5">
    <Kpi label="Facturación bruta" value={formatMoney(current.revenue, currency)} delta={computeDelta(current.revenue, previous.revenue)}/>
    <Kpi label="Entradas vendidas" value={current.units.toLocaleString("es-AR")} delta={computeDelta(current.units, previous.units)}/>
    <Kpi label="Compradores únicos" value={current.buyers.toLocaleString("es-AR")} delta={computeDelta(current.buyers, previous.buyers)}/>
    <Kpi label="Ticket promedio" value={formatMoney(avg(current), currency)} delta={computeDelta(avg(current), avg(previous))}/>
    <Kpi label="Ocupación promedio" value={occupancy === null ? "—" : `${Math.round(occupancy)}%`} hint="Entradas emitidas sobre capacidad"/>
  </div>;
}
