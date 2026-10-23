import { formatMoney } from "@/shared/lib/format";
import { formatMoneyCompact } from "./format";

type Day = { day: string; sales_amount: number; fee_amount: number; orders_count: number };

/** Barras de ventas por día, sin librerías. Cada barra tiene su detalle como texto accesible. */
export function SalesChart({ days }: { days: Day[] }) {
  const max = Math.max(1, ...days.map((day) => day.sales_amount));
  const total = days.reduce((sum, day) => sum + day.sales_amount, 0);
  const label = (value: string) => new Date(`${value}T12:00:00-03:00`).toLocaleDateString("es-AR", { day: "numeric", month: "numeric" });
  return <section className="card mt-5 p-5" aria-label="Ventas por día">
    <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="font-black">Ventas de los últimos {days.length} días</h2><p className="text-xs text-neutral-500">Total {formatMoneyCompact(total)} · valor de las entradas</p></div>
    {total > 0 ? <ol className="mt-4 flex h-40 items-end gap-1.5" role="list">
      {days.map((day) => <li key={day.day} className="group flex h-full min-w-0 flex-1 flex-col justify-end" title={`${label(day.day)}: ${formatMoney(day.sales_amount)} en ${day.orders_count} compras (cargo ENPASS ${formatMoney(day.fee_amount)})`}>
        <span className="sr-only">{label(day.day)}: {formatMoney(day.sales_amount)}, {day.orders_count} compras</span>
        <div className="w-full rounded-t-md bg-[var(--accent)] opacity-80 transition group-hover:opacity-100" style={{ height: `${Math.max(day.sales_amount > 0 ? 3 : 0, (day.sales_amount / max) * 100)}%` }} aria-hidden/>
      </li>)}
    </ol> : <p className="mt-4 text-sm text-neutral-500">No hubo ventas en este período.</p>}
    {total > 0 && <div className="mt-2 flex justify-between text-[11px] text-neutral-500" aria-hidden><span>{label(days[0]!.day)}</span><span>Máx. {formatMoneyCompact(max)} en un día</span><span>{label(days[days.length - 1]!.day)}</span></div>}
  </section>;
}
