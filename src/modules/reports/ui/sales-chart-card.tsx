"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { ReportGroup } from "../domain/report";
import { ReportCard } from "./report-card";
import { SalesChart } from "./sales-chart";

/** "Ventas en el tiempo": la agrupación (hora/día/semana/mes) se guarda en la URL y recalcula el reporte. */
export function SalesChartCard({ buckets, group, currency }: { buckets: Array<{ key: string; time: number; revenue: number; units: number; ops: number; buyers: number }>; group: ReportGroup; currency: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  function changeGroup(next: ReportGroup) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("group", next);
    router.push(`/app/reportes?${params.toString()}` as never, { scroll: false });
  }
  return <ReportCard title="Ventas en el tiempo" className="min-w-0"><SalesChart buckets={buckets} group={group} currency={currency} onGroupChange={changeGroup}/></ReportCard>;
}
