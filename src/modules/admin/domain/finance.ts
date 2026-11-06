export const EXPENSE_CATEGORIES = [
  { value: "infraestructura", label: "Infraestructura" },
  { value: "mail", label: "Mail" },
  { value: "contador", label: "Contador" },
  { value: "publicidad", label: "Publicidad" },
  { value: "sueldos", label: "Sueldos" },
  { value: "impuestos", label: "Impuestos" },
  { value: "otros", label: "Otros" },
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]["value"];
export const categoryLabel = (value: string) => EXPENSE_CATEGORIES.find((category) => category.value === value)?.label ?? value;

export type FinanceExpense = { id: string; expense_date: string; concept: string; category: string; amount_cents: number; kind: "fijo" | "variable"; notes: string | null };
export type FinanceRecurring = { id: string; concept: string; category: string; amount_cents: number; starts_on: string; ends_on: string | null };
export type FinanceMonth = {
  tickets_fees: number; tickets_count: number; dues_fees: number; mp_cost_enpass: number; avg_fee_per_ticket: number | null;
  expenses: FinanceExpense[]; recurring: FinanceRecurring[];
};

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** "aaaa-mm" válido o, si no, el mes actual en hora de Argentina (UTC-3). */
export function parseMonth(value: string | undefined, now = new Date()) {
  if (value && MONTH.test(value)) return value;
  const argentina = new Date(now.getTime() - 3 * 3600_000);
  return `${argentina.getUTCFullYear()}-${String(argentina.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Hoy como aaaa-mm-dd en hora de Argentina (UTC-3). */
export const todayInArgentina = (now = new Date()) => new Date(now.getTime() - 3 * 3600_000).toISOString().slice(0, 10);

export function shiftMonth(month: string, delta: number) {
  const [year, number] = month.split("-").map(Number) as [number, number];
  const index = year * 12 + (number - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

export const monthFirstDay = (month: string) => `${month}-01`;

export function monthLabel(month: string) {
  const [year, number] = month.split("-").map(Number) as [number, number];
  const text = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, number - 1, 1)));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Pesos escritos por una persona ("25.000", "25000,50", "$ 1.234,5") → centavos. null si no es un monto positivo. */
export function pesosToCents(text: string) {
  const cleaned = text.replace(/[^\d.,]/g, "");
  if (!cleaned) return null;
  // Con coma, la coma es el decimal y los puntos son miles; sin coma, un punto seguido de 1-2 dígitos finales también es decimal.
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".")
    : /\.\d{1,2}$/.test(cleaned) ? cleaned : cleaned.replace(/\./g, "");
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0 || value > 1e9) return null;
  return Math.round(value * 100);
}

export function financeResult(data: FinanceMonth) {
  const income = data.tickets_fees + data.dues_fees;
  const recurringTotal = data.recurring.reduce((sum, item) => sum + item.amount_cents, 0);
  const oneOffFixed = data.expenses.filter((item) => item.kind === "fijo").reduce((sum, item) => sum + item.amount_cents, 0);
  const variable = data.expenses.filter((item) => item.kind === "variable").reduce((sum, item) => sum + item.amount_cents, 0);
  const fixed = recurringTotal + oneOffFixed;
  const expenses = fixed + variable + data.mp_cost_enpass;
  // Entradas que hay que vender en el mes para que el cargo promedio por entrada cubra los gastos fijos.
  const breakEvenTickets = data.avg_fee_per_ticket && data.avg_fee_per_ticket > 0 ? Math.ceil(fixed / data.avg_fee_per_ticket) : null;
  return { income, recurringTotal, fixed, variable, expenses, result: income - expenses, breakEvenTickets };
}
