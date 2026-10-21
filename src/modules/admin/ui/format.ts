import { formatMoney } from "@/shared/lib/format";

/** Montos grandes en formato corto ($ 48,2 M); los chicos, completos. Los importes vienen en centavos. */
export function formatMoneyCompact(cents: number) {
  const pesos = cents / 100;
  if (Math.abs(pesos) >= 1_000_000) return `$ ${(pesos / 1_000_000).toLocaleString("es-AR", { maximumFractionDigits: 1 })} M`;
  if (Math.abs(pesos) >= 100_000) return `$ ${Math.round(pesos / 1000).toLocaleString("es-AR")} mil`;
  return formatMoney(cents);
}

export function percentChange(current: number, previous: number) {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "numeric", timeZone: "America/Argentina/Buenos_Aires" });
}
