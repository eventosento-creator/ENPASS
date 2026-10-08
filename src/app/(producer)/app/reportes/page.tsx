import { redirect } from "next/navigation";
import { BarChart3 } from "lucide-react";
import { getCurrentOrganization } from "@/modules/organizations/application/queries";
import { getOrgReport, getReportFilterOptions } from "@/modules/reports/application/queries";
import { fillSeries, hasReportData, parseReportFilters } from "@/modules/reports/domain/report";
import { AccessCard } from "@/modules/reports/ui/access-card";
import { EventsTable } from "@/modules/reports/ui/events-table";
import { ExportButton } from "@/modules/reports/ui/export-button";
import { KpiCards } from "@/modules/reports/ui/kpi-cards";
import { ChannelCard, OriginCard } from "@/modules/reports/ui/origin-and-channel";
import { ReportsFilters } from "@/modules/reports/ui/reports-filters";
import { ReportsSectionNav } from "@/modules/reports/ui/reports-section-nav";
import { RrppCard } from "@/modules/reports/ui/rrpp-card";
import { SalesChartCard } from "@/modules/reports/ui/sales-chart-card";
import { TicketTypesCard } from "@/modules/reports/ui/ticket-types-card";
import { EmptyState } from "@/shared/ui/empty-state";

export const metadata = { title: "Reportes" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const organization = await getCurrentOrganization();
  if (!organization) redirect("/app/onboarding");
  if (!["owner", "admin"].includes(organization.role)) redirect("/app");

  const filters = parseReportFilters(await searchParams);
  const [options, result] = await Promise.all([
    getReportFilterOptions(organization.id),
    getOrgReport(organization.id, filters).catch(() => null),
  ]);

  const header = <>
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="page-title">Reportes</h1><p className="mt-2 text-sm text-[var(--muted)]">Todo el rendimiento de tus eventos en un solo lugar.</p></div>
      <ExportButton/>
    </header>
    <ReportsSectionNav/>
    <div className="mt-5"><ReportsFilters filters={filters} events={options.events} cities={options.cities}/></div>
  </>;

  if (!result) return <>{header}<div className="mt-8"><EmptyState icon={BarChart3} title="No pudimos cargar los reportes" description="Probá de nuevo en unos segundos. Si sigue pasando, avisanos."/></div></>;

  const { report, range, group } = result;
  if (!hasReportData(report)) return <>{header}<div className="mt-8"><EmptyState icon={BarChart3} title="Todavía no hay datos suficientes para este período" description="Probá con otro período o con todos los eventos. Apenas haya ventas cobradas, vas a verlas acá."/></div></>;

  const currency = organization.default_currency;
  const buckets = fillSeries(report.series, range, group).map((bucket) => ({ key: bucket.key, time: bucket.date.getTime(), revenue: bucket.revenue, units: bucket.units, ops: bucket.ops, buyers: bucket.buyers }));

  return <div className="grid gap-5 [&>*]:min-w-0">
    <div>{header}</div>
    <KpiCards report={report} currency={currency}/>
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="min-w-0 lg:col-span-2"><SalesChartCard buckets={buckets} group={group} currency={currency}/></div>
      <OriginCard report={report}/>
    </div>
    <EventsTable events={report.events} currency={currency}/>
    <div className="grid gap-5 lg:grid-cols-2">
      <RrppCard rows={report.rrpp} currency={currency}/>
      <TicketTypesCard report={report} currency={currency}/>
    </div>
    <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
      <AccessCard report={report}/>
      <ChannelCard report={report}/>
    </div>
  </div>;
}
