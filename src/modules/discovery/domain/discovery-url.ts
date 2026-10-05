import type { DiscoveryFilters, DiscoveryPrice, DiscoveryWhen } from "./discovery";
import type { EventDiscoveryCategory } from "@/modules/events/domain/event-profile";

type Overrides = { city?: string; when?: DiscoveryWhen; category?: EventDiscoveryCategory; q?: string; price?: DiscoveryPrice };

/** URL de /eventos con los filtros actuales, cambiando solo lo indicado (pasar `undefined` en una clave la quita). */
export function buildFilterUrl(filters: DiscoveryFilters, overrides: Overrides = {}, cleared: Array<keyof Overrides> = []) {
  const next: DiscoveryFilters & Overrides = { ...filters, ...overrides };
  for (const key of cleared) delete next[key];
  const params = new URLSearchParams();
  if (next.city) params.set("city", next.city);
  if (next.category) params.set("category", next.category);
  if (next.q) params.set("q", next.q);
  if (next.when && next.when !== "all") params.set("when", next.when);
  if (next.price) params.set("price", next.price);
  const query = params.toString();
  return query ? `/eventos?${query}` as const : "/eventos" as const;
}

export const whenLabels: Record<DiscoveryWhen, string> = { all: "Cualquier fecha", today: "Hoy", tomorrow: "Mañana", weekend: "Este fin de semana" };
export const priceLabels: Record<DiscoveryPrice | "all", string> = { all: "Todos", free: "Gratis", paid: "Pago" };
