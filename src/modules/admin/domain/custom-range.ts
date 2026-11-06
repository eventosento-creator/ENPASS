const AR_OFFSET_MS = 3 * 3600_000;
const MAX_DAYS = 366;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function startOfArgentinaDay(date: string) {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const time = Date.UTC(year, month - 1, day);
  const check = new Date(time);
  // Rechaza fechas que no existen (2026-02-31 se corría a marzo).
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return time + AR_OFFSET_MS;
}

/** Rango [desde, hasta) en hora de Argentina para dos fechas aaaa-mm-dd inclusivas. Devuelve null si falta algo, son inválidas, están al revés o pasan de un año. */
export function customPeriodRange(desde: string | undefined, hasta: string | undefined) {
  if (!desde || !hasta || !DATE.test(desde) || !DATE.test(hasta)) return null;
  const from = startOfArgentinaDay(desde);
  const lastDay = startOfArgentinaDay(hasta);
  if (from === null || lastDay === null || lastDay < from) return null;
  const to = lastDay + 24 * 3600_000;
  if ((to - from) / (24 * 3600_000) > MAX_DAYS) return null;
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString(), desde, hasta };
}
