"use client";

import { useState } from "react";
import { formatCompactMoney, groupLabels, type ReportGroup } from "../domain/report";
import { formatMoney } from "@/shared/lib/format";
import { reportColors } from "./colors";

type Bucket = { key: string; time: number; revenue: number; units: number; ops: number; buyers: number };
type Metric = "revenue" | "units" | "ops" | "buyers";

const metricLabels: Record<Metric, string> = { revenue: "Facturación", units: "Entradas", ops: "Operaciones", buyers: "Compradores" };
const selectClass = "h-9 cursor-pointer rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 text-xs font-bold outline-none focus:border-[var(--accent)]";

function niceMax(value: number) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  return (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
}

function bucketLabel(time: number, group: ReportGroup) {
  const date = new Date(time);
  const part = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", ...options }).format(date).replace(".", "");
  if (group === "hour") return `${part({ day: "numeric", month: "short" })} · ${part({ hour: "2-digit", minute: "2-digit", hour12: false })}`;
  if (group === "month") return part({ month: "long", year: "numeric" });
  if (group === "week") return `Semana del ${part({ day: "numeric", month: "short" })}`;
  return part({ weekday: "short", day: "numeric", month: "short" });
}

/** Ventas en el tiempo: barras con tooltip. La métrica se cambia en el cliente; la agrupación recarga con la URL. */
export function SalesChart({ buckets, group, currency, onGroupChange }: { buckets: Bucket[]; group: ReportGroup; currency: string; onGroupChange: (group: ReportGroup) => void }) {
  const [metric, setMetric] = useState<Metric>("revenue");
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(...buckets.map((bucket) => bucket[metric]), 0));
  const format = (value: number) => metric === "revenue" ? formatCompactMoney(value) : value.toLocaleString("es-AR");
  const ticks = [1, 0.75, 0.5, 0.25, 0];
  const labelEvery = Math.max(1, Math.ceil(buckets.length / 7));
  const active = hover === null ? null : buckets[hover];

  return <div>
    <div className="flex flex-wrap items-center justify-end gap-2">
      <label className="sr-only" htmlFor="sales-metric">Métrica</label>
      <select id="sales-metric" className={selectClass} value={metric} onChange={(event) => setMetric(event.target.value as Metric)}>{(Object.keys(metricLabels) as Metric[]).map((key) => <option key={key} value={key}>{metricLabels[key]}</option>)}</select>
      <label className="sr-only" htmlFor="sales-group">Agrupar por</label>
      <select id="sales-group" className={selectClass} value={group} onChange={(event) => onGroupChange(event.target.value as ReportGroup)}>{(Object.keys(groupLabels) as ReportGroup[]).map((key) => <option key={key} value={key}>{groupLabels[key]}</option>)}</select>
    </div>
    <div className="mt-4 flex gap-3">
      <div className="flex h-56 shrink-0 flex-col justify-between text-right text-[11px] font-semibold tabular-nums text-[var(--muted)]" aria-hidden>{ticks.map((tick) => <span key={tick}>{format(max * tick)}</span>)}</div>
      <div className="min-w-0 flex-1">
        <div className="relative h-56" onMouseLeave={() => setHover(null)}>
          {ticks.map((tick) => <div key={tick} aria-hidden className="absolute inset-x-0 border-t border-dashed border-[var(--border)]" style={{ bottom: `${tick * 100}%` }}/>)}
          <div className="absolute inset-0 flex items-end gap-[2px]">
            {buckets.map((bucket, index) => <div key={bucket.key} className="relative flex h-full min-w-0 flex-1 items-end" onMouseEnter={() => setHover(index)} onFocus={() => setHover(index)} tabIndex={0} aria-label={`${bucketLabel(bucket.time, group)}: ${format(bucket[metric])}`}>
              <div className="w-full rounded-t-[3px] transition-opacity" style={{ height: `${Math.max((bucket[metric] / max) * 100, bucket[metric] > 0 ? 1.5 : 0)}%`, background: reportColors.sales, opacity: hover === null || hover === index ? 1 : 0.45 }}/>
            </div>)}
          </div>
          {active && hover !== null && <div className="pointer-events-none absolute top-0 z-10 w-44 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-raised)] p-3 text-xs shadow-xl" style={{ left: `${Math.min(Math.max(((hover + 0.5) / buckets.length) * 100, 14), 86)}%`, transform: "translateX(-50%)" }}>
            <p className="font-black">{bucketLabel(active.time, group)}</p>
            <p className="mt-1.5 text-sm font-black">{formatMoney(active.revenue, currency)}</p>
            <p className="text-[var(--muted)]">{active.units.toLocaleString("es-AR")} entradas · {active.ops.toLocaleString("es-AR")} operaciones</p>
          </div>}
        </div>
        <div className="mt-2 flex gap-[2px] text-[11px] font-semibold text-[var(--muted)]" aria-hidden>{buckets.map((bucket, index) => <span key={bucket.key} className="min-w-0 flex-1 overflow-visible whitespace-nowrap text-center">{index % labelEvery === 0 ? new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", ...(group === "hour" ? { hour: "2-digit", hour12: false } : group === "month" ? { month: "short" } : { day: "numeric", month: "short" }) }).format(new Date(bucket.time)).replace(".", "") : ""}</span>)}</div>
      </div>
    </div>
  </div>;
}
