export function formatMoney(amount: number, currency = "ARS") {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount / 100);
}

export function formatEventDate(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: timezone }).formatToParts(new Date(value));
  const valueOf = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? "";
  const weekday = valueOf("weekday");
  const human = `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${valueOf("day")} de ${valueOf("month")} · ${valueOf("hour")}:${valueOf("minute")}`;
  return human;
}

export function formatCompactEventDate(value: string, timezone: string) {
  const date = new Intl.DateTimeFormat("es-AR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: timezone }).format(new Date(value));
  return date.replace(",", " ·").replace(".", "").toUpperCase();
}

export function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
