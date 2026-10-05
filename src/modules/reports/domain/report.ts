// Tipos y utilidades puras de Reportes (sin acceso a datos) para poder testearlas.

export type ReportGroup = "hour" | "day" | "week" | "month";
export type ReportPeriod = "today" | "7d" | "30d" | "month" | "prev-month" | "year" | "custom";

export type ReportKpiTotals = { revenue: number; ops: number; buyers: number; units: number };
export type ReportSeriesRow = { bucket: string; revenue: number; units: number; ops: number; buyers: number };
export type ReportOrigin = { key: "direct" | "rrpp" | "box_office" | "tables"; revenue: number; units: number };
export type ReportEventRow = { id: string; name: string; starts_at: string; cover: string | null; revenue: number; units: number; ops: number; capacity: number; issued: number };
export type ReportRrppRow = { id: string; name: string; revenue: number; units: number };
export type ReportTicketType = { name: string; quantity: number; issued: number; sold: number; revenue: number };

export type OrgReport = {
  range: { from: string; to: string; group: ReportGroup };
  kpis: { current: ReportKpiTotals; previous: ReportKpiTotals; occupancy: number | null; courtesy_tickets: number };
  series: ReportSeriesRow[];
  origin: ReportOrigin[];
  events: ReportEventRow[];
  rrpp: ReportRrppRow[];
  ticket_types: ReportTicketType[];
  access: { issued: number; entered: number; hourly: Array<{ hour: number; count: number }> };
  channels: Array<{ key: "online" | "box_office"; revenue: number }>;
};

export type ReportFilters = { period: ReportPeriod; from?: string; to?: string; event?: string; group?: ReportGroup; channel?: "online" | "box_office"; status?: "published" | "sold_out" | "finished"; city?: string };

const AR_OFFSET_MS = 3 * 3_600_000; // Argentina: UTC-3 todo el año, sin horario de verano.
const DAY_MS = 86_400_000;

export const periodLabels: Record<ReportPeriod, string> = {
  today: "Hoy", "7d": "Últimos 7 días", "30d": "Últimos 30 días", month: "Este mes", "prev-month": "Mes anterior", year: "Este año", custom: "Personalizado",
};

export const groupLabels: Record<ReportGroup, string> = { hour: "Hora", day: "Día", week: "Semana", month: "Mes" };

/** Inicio del día (00:00 hora argentina) que contiene a `date`, como instante UTC. */
export function startOfDayAR(date: Date) {
  const local = new Date(date.getTime() - AR_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + AR_OFFSET_MS);
}

function arDate(year: number, month: number, day: number) { return new Date(Date.UTC(year, month, day) + AR_OFFSET_MS); }

export function resolvePeriod(filters: Pick<ReportFilters, "period" | "from" | "to">, now = new Date()): { from: Date; to: Date } {
  const todayStart = startOfDayAR(now);
  const tomorrowStart = new Date(todayStart.getTime() + DAY_MS);
  const local = new Date(now.getTime() - AR_OFFSET_MS);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  switch (filters.period) {
    case "today": return { from: todayStart, to: tomorrowStart };
    case "7d": return { from: new Date(tomorrowStart.getTime() - 7 * DAY_MS), to: tomorrowStart };
    case "month": return { from: arDate(year, month, 1), to: arDate(year, month + 1, 1) };
    case "prev-month": return { from: arDate(year, month - 1, 1), to: arDate(year, month, 1) };
    case "year": return { from: arDate(year, 0, 1), to: arDate(year + 1, 0, 1) };
    case "custom": {
      const from = parseDay(filters.from);
      const to = parseDay(filters.to);
      if (from && to && to >= from) return { from: arDate(from.y, from.m, from.d), to: new Date(arDate(to.y, to.m, to.d).getTime() + DAY_MS) };
      return { from: new Date(tomorrowStart.getTime() - 30 * DAY_MS), to: tomorrowStart };
    }
    default: return { from: new Date(tomorrowStart.getTime() - 30 * DAY_MS), to: tomorrowStart };
  }
}

function parseDay(value: string | undefined) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  return match ? { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) } : null;
}

/** Agrupación por defecto según el largo del período; "hora" solo tiene sentido en rangos cortos. */
export function resolveGroup(requested: ReportGroup | undefined, range: { from: Date; to: Date }): ReportGroup {
  const days = (range.to.getTime() - range.from.getTime()) / DAY_MS;
  if (requested === "hour" && days > 3) return "day";
  if (requested === "day" && days > 400) return "month";
  if (requested) return requested;
  if (days <= 2) return "hour";
  if (days <= 62) return "day";
  if (days <= 200) return "week";
  return "month";
}

export type FilledBucket = { key: string; date: Date; revenue: number; units: number; ops: number; buyers: number };

/** Completa con ceros los buckets sin ventas, para que el gráfico muestre el tiempo continuo. Las fechas son "hora argentina" como UTC. */
export function fillSeries(rows: ReportSeriesRow[], range: { from: Date; to: Date }, group: ReportGroup): FilledBucket[] {
  const byKey = new Map(rows.map((row) => [row.bucket, row]));
  const key = (date: Date) => date.toISOString().slice(0, 19);
  const start = truncate(new Date(range.from.getTime() - AR_OFFSET_MS), group);
  const end = new Date(range.to.getTime() - AR_OFFSET_MS);
  const result: FilledBucket[] = [];
  for (let cursor = start; cursor < end && result.length < 800; cursor = step(cursor, group)) {
    const row = byKey.get(key(cursor));
    result.push({ key: key(cursor), date: cursor, revenue: row?.revenue ?? 0, units: row?.units ?? 0, ops: row?.ops ?? 0, buyers: row?.buyers ?? 0 });
  }
  return result;
}

function truncate(date: Date, group: ReportGroup) {
  const d = new Date(date);
  if (group === "hour") d.setUTCMinutes(0, 0, 0);
  else { d.setUTCHours(0, 0, 0, 0); }
  if (group === "week") d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // semana que arranca el lunes, como date_trunc('week')
  if (group === "month") d.setUTCDate(1);
  return d;
}

function step(date: Date, group: ReportGroup) {
  const d = new Date(date);
  if (group === "hour") d.setUTCHours(d.getUTCHours() + 1);
  else if (group === "day") d.setUTCDate(d.getUTCDate() + 1);
  else if (group === "week") d.setUTCDate(d.getUTCDate() + 7);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

export type Delta = { pct: number | null; direction: "up" | "down" | "flat" | "new" };

/** Variación contra el período anterior equivalente. Sin base de comparación (0) no se inventa un porcentaje. */
export function computeDelta(current: number, previous: number): Delta {
  if (previous <= 0) return { pct: null, direction: current > 0 ? "new" : "flat" };
  const pct = ((current - previous) / previous) * 100;
  return { pct, direction: pct > 0.5 ? "up" : pct < -0.5 ? "down" : "flat" };
}

/** Importe compacto para los centros de los donuts: 12850000 -> "$ 12.8M". `minor` = centavos. */
export function formatCompactMoney(minor: number) {
  const value = minor / 100;
  const abs = Math.abs(value);
  const trim = (n: number) => (Math.round(n * 10) / 10).toString().replace(".", ",");
  if (abs >= 1_000_000_000) return `$ ${trim(value / 1_000_000_000)}B`;
  if (abs >= 1_000_000) return `$ ${trim(value / 1_000_000)}M`;
  if (abs >= 10_000) return `$ ${trim(value / 1_000)}K`;
  return `$ ${Math.round(value).toLocaleString("es-AR")}`;
}

export function hasReportData(report: OrgReport) {
  return report.kpis.current.ops > 0 || report.kpis.current.units > 0 || report.kpis.courtesy_tickets > 0;
}

export function parseReportFilters(input: Record<string, string | string[] | undefined>): ReportFilters {
  const one = (key: string) => { const value = input[key]; return Array.isArray(value) ? value[0] : value; };
  const period = (Object.keys(periodLabels) as ReportPeriod[]).includes(one("period") as ReportPeriod) ? one("period") as ReportPeriod : "30d";
  const group = (Object.keys(groupLabels) as ReportGroup[]).includes(one("group") as ReportGroup) ? one("group") as ReportGroup : undefined;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const event = one("event");
  const channel = one("canal");
  const status = one("estado");
  const city = one("ciudad")?.trim();
  return {
    period, group, from: one("from"), to: one("to"),
    event: event && uuid.test(event) ? event : undefined,
    channel: channel === "online" || channel === "box_office" ? channel : undefined,
    status: status === "published" || status === "sold_out" || status === "finished" ? status : undefined,
    city: city ? city.slice(0, 80) : undefined,
  };
}
