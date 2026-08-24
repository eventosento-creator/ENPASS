import { formatInTimeZone } from "date-fns-tz";
import { slugify } from "@/shared/lib/format";

export const discoveryWhenValues = ["all", "today", "tomorrow", "weekend"] as const;
export type DiscoveryWhen = (typeof discoveryWhenValues)[number];

export type DiscoveryEvent = {
  id: string;
  slug: string;
  name: string;
  description: string;
  cover_image_url: string | null;
  starts_at: string;
  currency: string;
  venue_name: string;
  venue_address: string;
  city: string;
  province: string;
  timezone: string;
  from_price_amount: number | null;
  has_availability: boolean;
};

export type DiscoveryFilters = { city?: string; when: DiscoveryWhen };

export function parseDiscoveryFilters(input: { city?: string | string[]; when?: string | string[] }): DiscoveryFilters {
  const cityValue = Array.isArray(input.city) ? input.city[0] : input.city;
  const whenValue = Array.isArray(input.when) ? input.when[0] : input.when;
  return {
    city: cityValue?.trim() ? slugify(cityValue) : undefined,
    when: discoveryWhenValues.includes(whenValue as DiscoveryWhen) ? whenValue as DiscoveryWhen : "all",
  };
}

export function filterDiscoveryEvents(events: DiscoveryEvent[], filters: DiscoveryFilters, now = new Date()) {
  return events
    .filter(event => !filters.city || slugify(event.city) === filters.city)
    .filter(event => matchesWhen(event, filters.when, now))
    .toSorted((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
}

export function getStartingPrice(types: Array<{ price_amount: number; active: boolean; sale_open: boolean; available_quantity: number; publicly_available?: boolean }>) {
  const prices = types.filter(type => type.publicly_available !== false && type.active && type.sale_open && type.available_quantity > 0 && type.price_amount >= 0).map(type => type.price_amount);
  return prices.length ? Math.min(...prices) : null;
}

export function getDiscoveryCities(events: DiscoveryEvent[]) {
  return [...new Map(events.map(event => [slugify(event.city), event.city])).entries()]
    .map(([value, label]) => ({ value, label }))
    .toSorted((a, b) => a.label.localeCompare(b.label, "es-AR"));
}

export function matchesWhen(event: Pick<DiscoveryEvent, "starts_at" | "timezone">, when: DiscoveryWhen, now = new Date()) {
  if (when === "all") return true;
  const eventDate = dateKey(new Date(event.starts_at), event.timezone);
  const today = dateKey(now, event.timezone);
  if (when === "today") return eventDate === today;
  if (when === "tomorrow") return eventDate === shiftDateKey(today, 1);
  const weekday = Number(formatInTimeZone(now, event.timezone, "i"));
  const fridayOffset = 5 - weekday;
  const friday = shiftDateKey(today, fridayOffset);
  return eventDate >= friday && eventDate <= shiftDateKey(friday, 2);
}

function dateKey(date: Date, timezone: string) {
  return formatInTimeZone(date, timezone, "yyyy-MM-dd");
}

function shiftDateKey(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
