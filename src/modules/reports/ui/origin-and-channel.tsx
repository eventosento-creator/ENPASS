import { formatCompactMoney, type OrgReport } from "../domain/report";
import { CardEmpty, ReportCard } from "./report-card";
import { DonutChart, DonutLegend, type DonutSegment } from "./donut-chart";
import { originLabels, reportColors } from "./colors";

export function OriginCard({ report }: { report: OrgReport }) {
  const order = ["direct", "rrpp", "box_office", "tables"] as const;
  const segments: DonutSegment[] = order.map((key) => ({ key, label: originLabels[key], value: report.origin.find((row) => row.key === key)?.revenue ?? 0, color: reportColors[key] })).filter((segment) => segment.value > 0);
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const courtesy = report.kpis.courtesy_tickets;
  return <ReportCard title="Origen de ventas">
    {total > 0 ? <div className="flex flex-wrap items-center gap-6 sm:flex-nowrap">
      <DonutChart segments={segments} center={formatCompactMoney(total)} caption="Facturación"/>
      <DonutLegend segments={segments}/>
    </div> : <CardEmpty text="Todavía no hay ventas cobradas en este período."/>}
    {courtesy > 0 && <p className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--border)] pt-3 text-sm"><span className="flex items-center gap-2 text-[var(--text-secondary)]"><span aria-hidden className="size-2.5 rounded-full" style={{ background: reportColors.courtesy }}/>Cortesías</span><span className="font-bold tabular-nums">{courtesy.toLocaleString("es-AR")} entradas <span className="font-medium text-[var(--muted)]">· sin facturación</span></span></p>}
  </ReportCard>;
}

export function ChannelCard({ report }: { report: OrgReport }) {
  const labels = { online: "Online", box_office: "Taquilla" } as const;
  const segments: DonutSegment[] = (["online", "box_office"] as const).map((key) => ({ key, label: labels[key], value: report.channels.find((row) => row.key === key)?.revenue ?? 0, color: key === "online" ? reportColors.online : reportColors.box_office })).filter((segment) => segment.value > 0);
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  return <ReportCard title="Canal de venta">
    {total > 0 ? <div className="flex flex-wrap items-center gap-6 sm:flex-nowrap"><DonutChart segments={segments} center={formatCompactMoney(total)} caption="Total"/><DonutLegend segments={segments}/></div> : <CardEmpty text="Sin ventas para comparar online y taquilla."/>}
  </ReportCard>;
}
