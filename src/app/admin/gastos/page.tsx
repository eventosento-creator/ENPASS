import Link from "next/link";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { getFinanceMonth } from "@/modules/admin/application/queries";
import { addExpense, addRecurringExpense, changeRecurringAmount, deleteExpense, endRecurringExpense } from "@/modules/admin/application/finance-actions";
import { EXPENSE_CATEGORIES, categoryLabel, financeResult, monthFirstDay, monthLabel, parseMonth, shiftMonth, todayInArgentina } from "@/modules/admin/domain/finance";
import { formatMoney } from "@/shared/lib/format";

const errors: Record<string, string> = {
  gasto: "Revisá el gasto: hace falta concepto, categoría, fecha y un monto mayor a cero.",
  fijo: "Revisá el gasto fijo: hace falta concepto, categoría y un monto mayor a cero.",
  monto: "Escribí un monto mayor a cero.",
  guardar: "No pudimos guardar el cambio. Probá de nuevo.",
};

export default async function AdminFinancePage({ searchParams }: { searchParams: Promise<{ mes?: string; error?: string }> }) {
  const query = await searchParams;
  const month = parseMonth(query.mes);
  const currentMonth = parseMonth(undefined);
  const data = await getFinanceMonth(month);
  if (!data) return <p className="text-sm text-neutral-500">No pudimos cargar los gastos. Probá de nuevo en un rato.</p>;
  const summary = financeResult(data);
  const monthLink = (target: string) => `/admin/gastos?mes=${target}` as never;
  const defaultDate = month === currentMonth ? todayInArgentina() : monthFirstDay(month);

  return <>
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="eyebrow">Administración</p><h1 className="page-title mt-1">Gastos</h1><p className="mt-2 text-sm text-neutral-500">Lo que cuesta sostener ENPASS y cuánto queda cada mes. Solo lo ves vos.</p></div>
      <nav aria-label="Mes" className="flex items-center gap-1.5">
        <Link href={monthLink(shiftMonth(month, -1))} aria-label="Mes anterior" className="grid size-9 place-items-center rounded-full border border-[var(--border-strong)] text-neutral-500"><ChevronLeft size={16}/></Link>
        <span className="min-w-36 text-center text-sm font-black">{monthLabel(month)}</span>
        <Link href={monthLink(shiftMonth(month, 1))} aria-label="Mes siguiente" className="grid size-9 place-items-center rounded-full border border-[var(--border-strong)] text-neutral-500"><ChevronRight size={16}/></Link>
        {month !== currentMonth && <Link href={monthLink(currentMonth)} className="ml-1 rounded-full border border-[var(--border-strong)] px-3.5 py-1.5 text-xs font-bold text-neutral-500">Este mes</Link>}
      </nav>
    </header>

    {query.error && errors[query.error] && <p role="alert" className="mt-5 rounded-xl border border-red-300/40 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-600">{errors[query.error]}</p>}

    <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Resultado del mes">
      <Stat label="Ingresos" value={formatMoney(summary.income)} note="cargo de ENPASS cobrado"/>
      <Stat label="Gastos" value={formatMoney(summary.expenses)} note={`${formatMoney(summary.fixed)} fijos · ${formatMoney(summary.variable + data.mp_cost_enpass)} variables`}/>
      <Stat label="Resultado" value={formatMoney(summary.result)} note={summary.result >= 0 ? "ganancia del mes" : "pérdida del mes"} tone={summary.result >= 0 ? "good" : "bad"}/>
      <Stat label="Punto de equilibrio" value={summary.breakEvenTickets === null ? "—" : `${summary.breakEvenTickets.toLocaleString("es-AR")} entradas`} note={summary.breakEvenTickets === null ? "todavía no hay ventas recientes" : `para cubrir los fijos (${formatMoney(data.avg_fee_per_ticket ?? 0)} de cargo por entrada)`}/>
    </section>

    <div className="mt-5 grid gap-4 lg:grid-cols-2">
      <section className="card p-5" aria-label="De dónde salen los ingresos">
        <h2 className="font-black">Ingresos del mes</h2>
        <dl className="mt-3 divide-y divide-[var(--border)] text-sm">
          <Row label={`Cargo de entradas (${data.tickets_count.toLocaleString("es-AR")} vendidas)`} value={formatMoney(data.tickets_fees)}/>
          <Row label="Cargo de cuotas de clubes" value={formatMoney(data.dues_fees)} note="neto de la comisión de Mercado Pago que absorbe ENPASS"/>
          {data.mp_cost_enpass > 0 && <Row label="Comisión de Mercado Pago (cuotas que cobra ENPASS)" value={`− ${formatMoney(data.mp_cost_enpass)}`}/>}
        </dl>
        <p className="mt-3 text-xs text-neutral-500">Calculado solo, con los mismos criterios del Resumen. No incluye todavía el costo de las transferencias ni de otros servicios cobrados aparte.</p>
      </section>

      <section className="card p-5" aria-label="Gastos fijos">
        <h2 className="font-black">Gastos fijos mensuales</h2>
        <p className="mt-1 text-xs text-neutral-500">Se repiten solos todos los meses. Un cambio de monto o una baja rige desde {monthLabel(month).toLowerCase()}; los meses anteriores no se tocan.</p>
        <div className="mt-2 divide-y divide-[var(--border)]">
          {data.recurring.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
            <span className="min-w-0"><b className="block truncate">{item.concept}</b><span className="text-xs text-neutral-500">{categoryLabel(item.category)}</span></span>
            <span className="flex flex-wrap items-center gap-2">
              <b>{formatMoney(item.amount_cents)}</b>
              <form action={changeRecurringAmount} className="flex items-center gap-1"><input type="hidden" name="mes" value={month}/><input type="hidden" name="id" value={item.id}/>
                <label className="sr-only" htmlFor={`m-${item.id}`}>Nuevo monto de {item.concept}</label>
                <input id={`m-${item.id}`} name="amount" inputMode="decimal" placeholder="Nuevo monto" className="field !min-h-9 w-28 !py-1 text-xs"/><button className="rounded-full border border-[var(--border-strong)] px-3 py-1.5 text-xs font-bold text-neutral-500" type="submit">Cambiar</button></form>
              <form action={endRecurringExpense}><input type="hidden" name="mes" value={month}/><input type="hidden" name="id" value={item.id}/><button className="rounded-full px-2 py-1.5 text-xs font-bold text-red-600 underline" type="submit">Dar de baja</button></form>
            </span>
          </div>)}
          {!data.recurring.length && <p className="py-3 text-sm text-neutral-500">Todavía no cargaste gastos fijos para este mes.</p>}
        </div>
        <form action={addRecurringExpense} className="mt-4 flex flex-wrap items-end gap-2 border-t border-[var(--border)] pt-4">
          <input type="hidden" name="mes" value={month}/>
          <label className="grid min-w-full gap-1 text-xs font-bold text-neutral-500 sm:min-w-48 sm:flex-1">Concepto<input name="concept" required maxLength={120} placeholder="Ej: Vercel" className="field !min-h-10"/></label>
          <label className="grid gap-1 text-xs font-bold text-neutral-500">Categoría<CategorySelect/></label>
          <label className="grid gap-1 text-xs font-bold text-neutral-500">Monto por mes<input name="amount" required inputMode="decimal" placeholder="25.000" className="field !min-h-10 w-28"/></label>
          <button className="btn btn-secondary" type="submit">Agregar fijo</button>
        </form>
      </section>
    </div>

    <section className="card mt-4 p-5" aria-label="Gastos del mes">
      <h2 className="font-black">Gastos de {monthLabel(month).toLowerCase()}</h2>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="text-xs font-bold text-neutral-500"><tr><th className="py-2 pr-3">Fecha</th><th className="py-2 pr-3">Concepto</th><th className="py-2 pr-3">Categoría</th><th className="py-2 pr-3">Tipo</th><th className="py-2 pr-3 text-right">Monto</th><th className="py-2"><span className="sr-only">Borrar</span></th></tr></thead>
          <tbody className="divide-y divide-[var(--border)]">
            {data.expenses.map((item) => <tr key={item.id}>
              <td className="py-2.5 pr-3 text-neutral-500">{item.expense_date.slice(8, 10)}/{item.expense_date.slice(5, 7)}</td>
              <td className="py-2.5 pr-3 font-bold">{item.concept}</td>
              <td className="py-2.5 pr-3 text-neutral-500">{categoryLabel(item.category)}</td>
              <td className="py-2.5 pr-3 text-neutral-500">{item.kind === "fijo" ? "Fijo" : "Variable"}</td>
              <td className="py-2.5 pr-3 text-right font-bold">{formatMoney(item.amount_cents)}</td>
              <td className="py-2.5 text-right"><form action={deleteExpense}><input type="hidden" name="mes" value={month}/><input type="hidden" name="id" value={item.id}/><button type="submit" aria-label={`Borrar ${item.concept}`} className="grid size-9 place-items-center rounded-full text-neutral-500 hover:bg-[var(--surface-strong)]"><Trash2 size={15}/></button></form></td>
            </tr>)}
            {!data.expenses.length && <tr><td colSpan={6} className="py-5 text-center text-neutral-500">Todavía no cargaste gastos este mes.</td></tr>}
          </tbody>
        </table>
      </div>
      <form action={addExpense} className="mt-4 flex flex-wrap items-end gap-2 border-t border-[var(--border)] pt-4">
        <input type="hidden" name="mes" value={month}/>
        <label className="grid gap-1 text-xs font-bold text-neutral-500">Fecha<input type="date" name="date" required defaultValue={defaultDate} min={monthFirstDay(month)} max={`${month}-31`} className="field !min-h-10"/></label>
        <label className="grid min-w-full gap-1 text-xs font-bold text-neutral-500 sm:min-w-48 sm:flex-1">Concepto<input name="concept" required maxLength={120} placeholder="Ej: Publicidad en Instagram" className="field !min-h-10"/></label>
        <label className="grid gap-1 text-xs font-bold text-neutral-500">Categoría<CategorySelect/></label>
        <label className="grid gap-1 text-xs font-bold text-neutral-500">Tipo<select name="kind" defaultValue="variable" className="field !min-h-10 w-auto"><option value="variable">Variable</option><option value="fijo">Fijo</option></select></label>
        <label className="grid gap-1 text-xs font-bold text-neutral-500">Monto<input name="amount" required inputMode="decimal" placeholder="25.000" className="field !min-h-10 w-28"/></label>
        <button className="btn btn-secondary" type="submit">Agregar gasto</button>
      </form>
    </section>
  </>;
}

function CategorySelect() {
  return <select name="category" defaultValue="otros" className="field !min-h-10 w-auto">{EXPENSE_CATEGORIES.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</select>;
}

function Row({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="flex items-baseline justify-between gap-3 py-2.5"><dt><span>{label}</span>{note && <span className="block text-xs text-neutral-500">{note}</span>}</dt><dd className="font-bold">{value}</dd></div>;
}

function Stat({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "good" | "bad" }) {
  return <div className="card p-4"><p className="text-xs font-bold text-neutral-500">{label}</p><p className="mt-1 text-2xl font-black tracking-[-.02em]">{value}</p><p className={`mt-1 text-xs ${tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-red-600" : "text-neutral-500"}`}>{note}</p></div>;
}
