"use client";

import { useState } from "react";
import { formatMoney } from "@/shared/lib/format";
import type { ReportRrppRow } from "../domain/report";
import { reportColors } from "./colors";
import { CardEmpty, ReportCard } from "./report-card";

/** Ranking de RRPP con barras comparables; se alterna entre entradas y facturación. */
export function RrppCard({ rows, currency }: { rows: ReportRrppRow[]; currency: string }) {
  const [metric, setMetric] = useState<"units" | "revenue">("revenue");
  const sorted = rows.toSorted((a, b) => b[metric] - a[metric]);
  const max = Math.max(...sorted.map((row) => row[metric]), 1);
  const toggle = <div role="group" aria-label="Ordenar ranking" className="inline-flex rounded-lg border border-[var(--border-strong)] p-0.5 text-xs font-bold">{([["units", "Entradas"], ["revenue", "Facturación"]] as const).map(([key, label]) => <button key={key} type="button" aria-pressed={metric === key} onClick={() => setMetric(key)} className={`rounded-md px-2.5 py-1 transition ${metric === key ? "bg-[var(--accent)] text-[var(--on-accent)]" : "text-[var(--muted)] hover:text-[var(--text)]"}`}>{label}</button>)}</div>;
  return <ReportCard title="RRPP destacados" action={rows.length ? toggle : undefined}>
    {sorted.length ? <ol className="grid gap-3.5">{sorted.map((row, index) => <li key={row.id} className="grid grid-cols-[1.25rem_1fr_auto] items-center gap-3">
      <span className="text-xs font-bold tabular-nums text-[var(--muted)]">{index + 1}</span>
      <div className="min-w-0"><div className="flex items-center justify-between gap-3 text-sm"><span className="truncate font-bold">{row.name}</span></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--surface-strong)]"><div className="h-full rounded-full" style={{ width: `${Math.max((row[metric] / max) * 100, 3)}%`, background: reportColors.rrpp }}/></div></div>
      <div className="text-right text-xs tabular-nums"><p className="font-black">{metric === "units" ? `${row.units.toLocaleString("es-AR")} entradas` : formatMoney(row.revenue, currency)}</p><p className="text-[var(--muted)]">{metric === "units" ? formatMoney(row.revenue, currency) : `${row.units.toLocaleString("es-AR")} entradas`}</p></div>
    </li>)}</ol> : <CardEmpty text="Ninguna venta de este período vino por RRPP."/>}
  </ReportCard>;
}
