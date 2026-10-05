"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowDown, ArrowUp } from "lucide-react";
import { EventCover } from "@/modules/events/ui/event-cover";
import { formatMoney } from "@/shared/lib/format";
import type { ReportEventRow } from "../domain/report";
import { reportColors } from "./colors";
import { CardEmpty, ReportCard } from "./report-card";

type SortKey = "name" | "starts_at" | "revenue" | "units" | "capacity" | "occupancy" | "avg";
const columns: Array<{ key: SortKey; label: string; align?: "right" }> = [
  { key: "name", label: "Evento" }, { key: "starts_at", label: "Fecha" }, { key: "revenue", label: "Facturación", align: "right" },
  { key: "units", label: "Entradas", align: "right" }, { key: "capacity", label: "Capacidad", align: "right" }, { key: "occupancy", label: "Ocupación" }, { key: "avg", label: "Ticket prom.", align: "right" },
];

const occupancy = (row: ReportEventRow) => (row.capacity > 0 ? (row.issued / row.capacity) * 100 : 0);
const average = (row: ReportEventRow) => (row.ops > 0 ? row.revenue / row.ops : 0);

function sortValue(row: ReportEventRow, key: SortKey): number | string {
  switch (key) {
    case "name": return row.name.toLocaleLowerCase("es-AR");
    case "starts_at": return new Date(row.starts_at).getTime();
    case "occupancy": return occupancy(row);
    case "avg": return average(row);
    default: return row[key];
  }
}

/** Rendimiento por evento: ordenable clickeando cada columna. */
export function EventsTable({ events, currency }: { events: ReportEventRow[]; currency: string }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "revenue", dir: "desc" });
  const rows = useMemo(() => events.toSorted((a, b) => {
    const x = sortValue(a, sort.key); const y = sortValue(b, sort.key);
    const result = typeof x === "string" && typeof y === "string" ? x.localeCompare(y, "es-AR") : Number(x) - Number(y);
    return sort.dir === "asc" ? result : -result;
  }), [events, sort]);
  const toggle = (key: SortKey) => setSort((current) => current.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" });
  const dateLabel = (value: string) => new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", weekday: "short", day: "numeric", month: "short" }).format(new Date(value)).replace(/\./g, "").replace(/^./, (c) => c.toUpperCase());

  return <ReportCard title="Rendimiento por evento" action={<Link href="/app/events" className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-strong)] px-3.5 py-1.5 text-xs font-bold transition hover:border-[var(--accent)]">Ver todos<ArrowRight aria-hidden size={13}/></Link>}>
    {rows.length ? <div className="-mx-5 overflow-x-auto px-5"><table className="w-full min-w-[46rem] text-left text-sm">
      <thead><tr className="border-b border-[var(--border)] text-xs text-[var(--muted)]">{columns.map((column) => <th key={column.key} scope="col" aria-sort={sort.key === column.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={`pb-2.5 pr-4 font-semibold last:pr-0 ${column.align === "right" ? "text-right" : ""}`}>
        <button type="button" onClick={() => toggle(column.key)} className={`inline-flex items-center gap-1 hover:text-[var(--text)] ${sort.key === column.key ? "text-[var(--text)]" : ""}`}>{column.label}{sort.key === column.key && (sort.dir === "asc" ? <ArrowUp aria-hidden size={12}/> : <ArrowDown aria-hidden size={12}/>)}</button></th>)}</tr></thead>
      <tbody>{rows.map((row) => { const occ = occupancy(row); return <tr key={row.id} className="border-b border-[var(--border)] last:border-0">
        <td className="py-3 pr-4"><Link href={`/app/events/${row.id}` as never} className="flex items-center gap-3 font-bold hover:underline"><EventCover src={row.cover} alt="" className="size-9 shrink-0 rounded-lg" sizes="40px"/><span className="line-clamp-1">{row.name}</span></Link></td>
        <td className="py-3 pr-4 whitespace-nowrap text-[var(--text-secondary)]">{dateLabel(row.starts_at)}</td>
        <td className="py-3 pr-4 text-right font-bold tabular-nums">{formatMoney(row.revenue, currency)}</td>
        <td className="py-3 pr-4 text-right tabular-nums">{row.units.toLocaleString("es-AR")}</td>
        <td className="py-3 pr-4 text-right tabular-nums text-[var(--text-secondary)]">{row.capacity.toLocaleString("es-AR")}</td>
        <td className="py-3 pr-4"><div className="flex items-center gap-2.5"><span className="w-10 text-xs font-bold tabular-nums">{Math.round(occ)}%</span><span className="h-1.5 w-24 overflow-hidden rounded-full bg-[var(--surface-strong)]"><span className="block h-full rounded-full" style={{ width: `${Math.min(occ, 100)}%`, background: reportColors.growth }}/></span></div></td>
        <td className="py-3 text-right tabular-nums">{row.ops > 0 ? formatMoney(Math.round(average(row)), currency) : "—"}</td>
      </tr>; })}</tbody>
    </table></div> : <CardEmpty text="No hay eventos con ventas en este período."/>}
  </ReportCard>;
}
