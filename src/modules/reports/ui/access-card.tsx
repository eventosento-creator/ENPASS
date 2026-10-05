import { type OrgReport } from "../domain/report";
import { CardEmpty, ReportCard } from "./report-card";
import { DonutChart } from "./donut-chart";
import { reportColors } from "./colors";

/** Asistencia (donut) + ingresos por hora, calculados con los escaneos reales de los eventos del período. */
export function AccessCard({ report }: { report: OrgReport }) {
  const { issued, entered, hourly } = report.access;
  const pct = issued > 0 ? Math.round((entered / issued) * 100) : 0;
  // Las horas se ordenan de noche: 18, 19, … 23, 00, 01 … para que la franja de la fiesta quede continua.
  const nightKey = (hour: number) => (hour < 12 ? hour + 24 : hour);
  const byHour = new Map(hourly.map((row) => [row.hour, row.count]));
  const sortedHours = hourly.map((row) => row.hour).toSorted((a, b) => nightKey(a) - nightKey(b));
  const hours: number[] = [];
  if (sortedHours.length) for (let key = nightKey(sortedHours[0]!); key <= nightKey(sortedHours.at(-1)!); key += 1) hours.push(key % 24);
  const max = Math.max(...hours.map((hour) => byHour.get(hour) ?? 0), 1);
  return <ReportCard title="Accesos / Asistencia">
    {issued > 0 ? <div className="flex flex-wrap items-center gap-6 sm:flex-nowrap">
      <div className="flex shrink-0 flex-col items-center gap-2"><DonutChart segments={[{ key: "in", label: "Ingresaron", value: entered, color: reportColors.growth }, { key: "out", label: "No ingresaron", value: Math.max(issued - entered, 0), color: "transparent" }]} center={`${pct}%`} caption="Asistencia" size={140}/>
        <p className="text-center text-sm font-black tabular-nums">{entered.toLocaleString("es-AR")} / {issued.toLocaleString("es-AR")}<span className="block text-xs font-medium text-[var(--muted)]">Ingresos confirmados</span></p></div>
      <div className="min-w-0 flex-1 self-stretch">
        <p className="text-xs font-bold text-[var(--muted)]">Ingresos por hora</p>
        {hours.length ? <div className="mt-3 flex h-36 items-end gap-1.5">{hours.map((hour) => { const count = byHour.get(hour) ?? 0; return <div key={hour} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end gap-1.5"><div className="relative min-h-0 flex-1"><div className="absolute inset-x-0 bottom-0 rounded-t-[3px]" style={{ height: `${Math.max((count / max) * 100, count > 0 ? 2 : 0)}%`, background: reportColors.sales }}/><span className="pointer-events-none absolute -top-5 left-1/2 hidden -translate-x-1/2 rounded bg-[var(--surface-raised)] px-1.5 py-0.5 text-[10px] font-bold shadow group-hover:block">{count}</span></div><span className="text-center text-[10px] font-semibold text-[var(--muted)]">{String(hour).padStart(2, "0")}</span></div>; })}</div> : <p className="mt-3 text-sm text-[var(--muted)]">Todavía no hay ingresos escaneados.</p>}
      </div>
    </div> : <CardEmpty text="No hay eventos con entradas emitidas en este período."/>}
  </ReportCard>;
}
