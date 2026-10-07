export type ClubReport = {
  range: { from: string; to: string };
  members: { active: number; suspended: number; cancelled: number; new_in_period: number; by_category: Array<{ name: string; monthly_fee: number; active_members: number }> };
  dues: {
    issued: { count: number; amount: number };
    collected: { count: number; amount: number; online_amount: number };
    by_method: Array<{ method: string; count: number; amount: number }>;
    pending: { count: number; amount: number };
    overdue: { count: number; amount: number; members: number };
    monthly: Array<{ month: string; collected: number }>;
  };
  divisions: Array<{ name: string; category: string | null; monthly_fee: number; enrolled: number; collected: number; overdue: number }>;
  debtors: Array<{ name: string; member_number: string; amount: number; dues: number; oldest_due: string }>;
  access: { total: number; allowed: number; with_debt: number; denied: number };
};

export const clubPeriods = ["month", "prev-month", "3m", "year"] as const;
export type ClubPeriod = (typeof clubPeriods)[number];
export const clubPeriodLabels: Record<ClubPeriod, string> = { month: "Este mes", "prev-month": "Mes anterior", "3m": "Últimos 3 meses", year: "Este año" };

export function parseClubPeriod(value: string | string[] | undefined): ClubPeriod {
  const first = Array.isArray(value) ? value[0] : value;
  return clubPeriods.includes(first as ClubPeriod) ? (first as ClubPeriod) : "month";
}

const AR_OFFSET_HOURS = 3; // Argentina es UTC-3 todo el año (sin horario de verano)

/** Rango [from, to) del período, alineado a la medianoche de Argentina. */
export function resolveClubPeriod(period: ClubPeriod, now = new Date()): { from: Date; to: Date } {
  const local = new Date(now.getTime() - AR_OFFSET_HOURS * 3_600_000);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  const start = (y: number, m: number) => new Date(Date.UTC(y, m, 1, AR_OFFSET_HOURS));
  switch (period) {
    case "prev-month": return { from: start(year, month - 1), to: start(year, month) };
    case "3m": return { from: start(year, month - 2), to: start(year, month + 1) };
    case "year": return { from: start(year, 0), to: start(year + 1, 0) };
    default: return { from: start(year, month), to: start(year, month + 1) };
  }
}

export function hasClubReportData(report: ClubReport) {
  return report.members.active + report.members.suspended + report.members.cancelled > 0 || report.dues.issued.count > 0 || report.dues.collected.count > 0 || report.dues.pending.count > 0 || report.dues.overdue.count > 0;
}

export const paymentMethodLabels: Record<string, string> = { mercado_pago: "Mercado Pago", cash: "Efectivo", transfer: "Transferencia", other: "Otro" };

/** "2026-05" → "may" */
export function shortMonthLabel(month: string) {
  const [year, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("es-AR", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(year!, m! - 1, 1))).replace(".", "");
}
