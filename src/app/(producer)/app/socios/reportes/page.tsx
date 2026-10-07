import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentOrganization } from "@/modules/organizations/application/queries";
import { getClubReport, isClubEnabled } from "@/modules/clubs/application/queries";
import { clubPeriodLabels, clubPeriods, hasClubReportData, parseClubPeriod, paymentMethodLabels, resolveClubPeriod, shortMonthLabel } from "@/modules/clubs/domain/report";
import { ClubBanner } from "@/modules/clubs/ui/club-banner";
import { ClubSectionNav } from "@/modules/clubs/ui/club-section-nav";
import { DonutChart, DonutLegend } from "@/modules/reports/ui/donut-chart";
import { CardEmpty, ReportCard } from "@/modules/reports/ui/report-card";
import { reportColors } from "@/modules/reports/ui/colors";
import { formatMoney } from "@/shared/lib/format";

const methodColors: Record<string, string> = { mercado_pago: reportColors.online, cash: reportColors.growth, transfer: reportColors.rrpp, other: reportColors.courtesy };

export default async function ClubReportsPage({ searchParams }: { searchParams: Promise<{ period?: string | string[] }> }) {
  const org = await getCurrentOrganization();
  if (!org) redirect("/app/onboarding");
  if (!(await isClubEnabled(org.id))) redirect("/app");
  const period = parseClubPeriod((await searchParams).period);
  const range = resolveClubPeriod(period);
  const report = await getClubReport(org.id, range.from, range.to);
  const money = (amount: number) => formatMoney(amount, org.default_currency);

  return <>
    <ClubBanner organizationId={org.id}/>
    <div><p className="eyebrow">Tu club</p><h1 className="page-title mt-2">Reportes</h1><p className="mt-3 text-neutral-500">Socios, cuotas y cobranza de tu club, con datos reales.</p></div>
    <ClubSectionNav active="reportes"/>
    <div className="no-scrollbar mt-5 flex gap-2 overflow-x-auto" role="group" aria-label="Período">
      {clubPeriods.map((value) => <Link key={value} href={`/app/socios/reportes?period=${value}` as never} aria-current={value === period ? "true" : undefined} className={`shrink-0 rounded-full border px-4 py-2 text-sm font-bold transition ${value === period ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]" : "border-[var(--border-strong)] text-[var(--muted)] hover:text-[var(--text)]"}`}>{clubPeriodLabels[value]}</Link>)}
    </div>

    {!report ? <div className="card mt-6 p-8 text-center"><p className="font-bold">No pudimos cargar los reportes</p><p className="mt-2 text-sm text-neutral-500">Probá de nuevo en unos segundos.</p></div>
    : !hasClubReportData(report) ? <div className="card mt-6 p-8 text-center"><p className="font-bold">Todavía no hay datos suficientes</p><p className="mt-2 text-sm text-neutral-500">Cuando cargues socios y generes cuotas, vas a ver acá cómo viene la cobranza.</p></div>
    : <div className="mt-6 grid gap-4">
      <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 xl:grid-cols-4">
        <Kpi label={`Cobrado · ${clubPeriodLabels[period].toLowerCase()}`} value={money(report.dues.collected.amount)} hint={`${plural(report.dues.collected.count, "cuota", "cuotas")} · ${money(report.dues.collected.online_amount)} online`}/>
        <Kpi label="Por cobrar (a vencer)" value={money(report.dues.pending.amount)} hint={`${plural(report.dues.pending.count, "cuota pendiente", "cuotas pendientes")}`}/>
        <Kpi tone="danger" label="Deuda vencida" value={money(report.dues.overdue.amount)} hint={`${plural(report.dues.overdue.members, "socio", "socios")} · ${plural(report.dues.overdue.count, "cuota", "cuotas")}`}/>
        <Kpi label="Socios activos" value={String(report.members.active)} hint={`${plural(report.members.new_in_period, "alta", "altas")} en el período${report.members.suspended ? ` · ${plural(report.members.suspended, "suspendido", "suspendidos")}` : ""}`}/>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ReportCard title="Recaudación de los últimos 6 meses" className="lg:col-span-2"><MonthlyBars months={report.dues.monthly} money={money}/></ReportCard>
        <ReportCard title="Cobrado por medio de pago">
          {report.dues.by_method.length ? <div className="flex flex-wrap items-center gap-x-5 gap-y-4"><DonutChart caption="cobrado" center={money(report.dues.collected.amount)} size={130} segments={report.dues.by_method.map((entry) => ({ key: entry.method, label: paymentMethodLabels[entry.method] ?? entry.method, value: entry.amount, color: methodColors[entry.method] ?? reportColors.courtesy }))}/><div className="min-w-[10rem] flex-1"><DonutLegend segments={report.dues.by_method.map((entry) => ({ key: entry.method, label: paymentMethodLabels[entry.method] ?? entry.method, value: entry.amount, color: methodColors[entry.method] ?? reportColors.courtesy }))}/></div></div> : <CardEmpty text="No hubo cobros en este período."/>}
        </ReportCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ReportCard title="Socios por categoría">
          {report.members.by_category.length ? <table className="w-full text-sm"><thead><tr className="text-left text-xs text-[var(--muted)]"><th className="pb-2 font-semibold">Categoría</th><th className="pb-2 text-right font-semibold">Cuota</th><th className="pb-2 text-right font-semibold">Socios</th></tr></thead><tbody>{report.members.by_category.map((category) => <tr key={category.name} className="border-t border-[var(--border)]"><td className="py-2.5 font-semibold">{category.name}</td><td className="py-2.5 text-right text-[var(--muted)]">{category.monthly_fee > 0 ? money(category.monthly_fee) : "—"}</td><td className="py-2.5 text-right font-bold tabular-nums">{category.active_members}</td></tr>)}</tbody></table> : <CardEmpty text="Todavía no hay categorías."/>}
        </ReportCard>
        <ReportCard title="Divisiones">
          {report.divisions.length ? <div className="overflow-x-auto"><table className="w-full min-w-[28rem] text-sm"><thead><tr className="text-left text-xs text-[var(--muted)]"><th className="pb-2 font-semibold">División</th><th className="pb-2 text-right font-semibold">Inscriptos</th><th className="pb-2 text-right font-semibold">Cobrado</th><th className="pb-2 text-right font-semibold">Vencido</th></tr></thead><tbody>{report.divisions.map((division) => <tr key={division.name} className="border-t border-[var(--border)]"><td className="py-2.5"><span className="font-semibold">{division.name}</span>{division.category && <span className="block text-xs text-[var(--muted)]">{division.category}</span>}</td><td className="py-2.5 text-right tabular-nums">{division.enrolled}</td><td className="py-2.5 text-right tabular-nums">{money(division.collected)}</td><td className={`py-2.5 text-right tabular-nums ${division.overdue > 0 ? "font-bold text-red-500" : "text-[var(--muted)]"}`}>{division.overdue > 0 ? money(division.overdue) : "—"}</td></tr>)}</tbody></table></div> : <CardEmpty text="Todavía no hay divisiones."/>}
        </ReportCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ReportCard title="Mayores deudores" className="lg:col-span-2">
          {report.debtors.length ? <ul className="grid gap-1">{report.debtors.map((debtor) => <li key={`${debtor.member_number}-${debtor.name}`} className="flex items-center justify-between gap-3 border-t border-[var(--border)] py-2.5 text-sm first:border-0"><span className="min-w-0"><span className="block truncate font-semibold">{debtor.name}</span><span className="text-xs text-[var(--muted)]">N° {debtor.member_number} · {plural(debtor.dues, "cuota", "cuotas")} · desde {new Date(`${debtor.oldest_due}T00:00:00`).toLocaleDateString("es-AR", { day: "numeric", month: "short" })}</span></span><span className="shrink-0 font-black text-red-500">{money(debtor.amount)}</span></li>)}</ul> : <CardEmpty text="No hay socios con deuda vencida. ¡Todo al día!"/>}
        </ReportCard>
        <ReportCard title="Ingresos al club">
          {report.access.total > 0 ? <dl className="grid gap-3 text-sm"><div className="flex justify-between"><dt className="text-[var(--muted)]">Intentos de ingreso</dt><dd className="font-black">{report.access.total}</dd></div><div className="flex justify-between"><dt className="text-[var(--muted)]">Entraron</dt><dd className="font-black">{report.access.allowed}</dd></div><div className="flex justify-between"><dt className="text-[var(--muted)]">Entraron con deuda</dt><dd className="font-black">{report.access.with_debt}</dd></div><div className="flex justify-between"><dt className="text-[var(--muted)]">Rechazados</dt><dd className="font-black">{report.access.denied}</dd></div></dl> : <CardEmpty text="No hubo ingresos registrados en este período."/>}
        </ReportCard>
      </div>
    </div>}
  </>;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: "danger" }) {
  return <div className="w-[15rem] shrink-0 snap-start rounded-[1.1rem] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-xs)] sm:w-auto">
    <p className="text-xs font-semibold text-[var(--muted)]">{label}</p>
    <p className={`mt-2 text-[1.65rem] font-black leading-none tracking-[-.03em] ${tone === "danger" ? "text-red-500" : ""}`}>{value}</p>
    <p className="mt-2 text-xs font-medium text-[var(--muted)]">{hint}</p>
  </div>;
}

function MonthlyBars({ months, money }: { months: Array<{ month: string; collected: number }>; money: (amount: number) => string }) {
  const max = Math.max(...months.map((entry) => entry.collected), 1);
  return <div className="flex h-48 items-end gap-3" role="img" aria-label={`Recaudación por mes: ${months.map((entry) => `${shortMonthLabel(entry.month)} ${money(entry.collected)}`).join(", ")}`}>
    {months.map((entry) => <div key={entry.month} className="flex h-full flex-1 flex-col items-center justify-end gap-2" title={`${shortMonthLabel(entry.month)}: ${money(entry.collected)}`}>
      <span className="text-[11px] font-bold tabular-nums text-[var(--muted)]">{entry.collected > 0 ? money(entry.collected) : ""}</span>
      <div className="w-full rounded-t-lg" style={{ height: `${Math.max((entry.collected / max) * 100, entry.collected > 0 ? 4 : 1)}%`, background: reportColors.sales, opacity: entry.collected > 0 ? 1 : .25 }}/>
      <span className="text-xs font-semibold capitalize text-[var(--muted)]">{shortMonthLabel(entry.month)}</span>
    </div>)}
  </div>;
}
