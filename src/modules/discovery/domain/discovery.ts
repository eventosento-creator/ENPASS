import { formatInTimeZone } from "date-fns-tz";
import { slugify } from "@/shared/lib/format";
import { EVENT_DISCOVERY_CATEGORIES, type EventDiscoveryCategory } from "@/modules/events/domain/event-profile";

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
  discovery_category: EventDiscoveryCategory;
  latitude: number | null;
  longitude: number | null;
};

export const discoveryPriceValues = ["free", "paid"] as const;
export type DiscoveryPrice = (typeof discoveryPriceValues)[number];

export type DiscoveryFilters = { city?: string; when: DiscoveryWhen; category?: EventDiscoveryCategory; q?: string; price?: DiscoveryPrice };

export function parseDiscoveryFilters(input: { city?: string | string[]; when?: string | string[]; category?: string | string[]; q?: string | string[]; price?: string | string[] }): DiscoveryFilters {
  const cityValue = Array.isArray(input.city) ? input.city[0] : input.city;
  const whenValue = Array.isArray(input.when) ? input.when[0] : input.when;
  const categoryValue = Array.isArray(input.category) ? input.category[0] : input.category;
  const qValue = Array.isArray(input.q) ? input.q[0] : input.q;
  const priceValue = Array.isArray(input.price) ? input.price[0] : input.price;
  return {
    city: cityValue?.trim() ? slugify(cityValue) : undefined,
    when: discoveryWhenValues.includes(whenValue as DiscoveryWhen) ? whenValue as DiscoveryWhen : "all",
    category: EVENT_DISCOVERY_CATEGORIES.includes(categoryValue as EventDiscoveryCategory) ? categoryValue as EventDiscoveryCategory : undefined,
    q: qValue?.trim() ? qValue.trim().slice(0, 80) : undefined,
    price: discoveryPriceValues.includes(priceValue as DiscoveryPrice) ? priceValue as DiscoveryPrice : undefined,
  };
}

export function filterDiscoveryEvents(events: DiscoveryEvent[], filters: DiscoveryFilters, now = new Date()) {
  return events
    .filter(event => !filters.city || slugify(event.city) === filters.city)
    .filter(event => !filters.category || event.discovery_category === filters.category)
    .filter(event => matchesWhen(event, filters.when, now))
    .filter(event => matchesQuery(event, filters.q))
    .filter(event => matchesPrice(event, filters.price))
    .toSorted((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
}

/** "Gratis" = la entrada más barata es $0; "Pago" = cobra (un evento sin precio cargado no entra en ninguno de los dos). */
export function matchesPrice(event: Pick<DiscoveryEvent, "from_price_amount">, price: DiscoveryPrice | undefined) {
  if (!price) return true;
  if (event.from_price_amount === null) return false;
  return price === "free" ? event.from_price_amount === 0 : event.from_price_amount > 0;
}

export function matchesQuery(event: Pick<DiscoveryEvent, "name" | "venue_name" | "city">, q: string | undefined) {
  if (!q) return true;
  const needle = normalizeForSearch(q);
  return normalizeForSearch(event.name).includes(needle)
    || normalizeForSearch(event.venue_name).includes(needle)
    || normalizeForSearch(event.city).includes(needle);
}

function normalizeForSearch(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
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

export type UserLocation = { lat: number; lng: number };
export const LOCATION_COOKIE = "nl_loc";

/** Cookie "lat,lng" (ya redondeada a ~1 km desde el navegador); null si falta o es inválida. */
export function parseLocationCookie(value: string | undefined): UserLocation | null {
  if (!value) return null;
  const [lat, lng] = value.split(",").map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat!) > 90 || Math.abs(lng!) > 180) return null;
  return { lat: lat!, lng: lng! };
}

export function distanceKm(from: UserLocation, to: UserLocation) {
  const rad = (degrees: number) => degrees * Math.PI / 180;
  const dLat = rad(to.lat - from.lat);
  const dLng = rad(to.lng - from.lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(from.lat)) * Math.cos(rad(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

export type NearbyDiscoveryEvent = DiscoveryEvent & { distanceKm: number | null };

/** Suma la distancia a cada evento y los ordena del más cercano al más lejano (sin coordenadas, al final, por fecha). */
export function sortByProximity(events: DiscoveryEvent[], location: UserLocation): NearbyDiscoveryEvent[] {
  return events
    .map((event) => ({ ...event, distanceKm: event.latitude !== null && event.longitude !== null ? distanceKm(location, { lat: event.latitude, lng: event.longitude }) : null }))
    .toSorted((a, b) => {
      if (a.distanceKm === null && b.distanceKm === null) return new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
      if (a.distanceKm === null) return 1;
      if (b.distanceKm === null) return -1;
      return a.distanceKm - b.distanceKm || new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
    });
}

export function formatDistance(km: number) {
  if (km < 1) return "A menos de 1 km";
  return `A ${km < 10 ? km.toFixed(1).replace(".", ",") : Math.round(km)} km`;
}
