import { describe, expect, it } from "vitest";
import { filterDiscoveryEvents, getDiscoveryCities, getStartingPrice, matchesWhen, parseDiscoveryFilters, type DiscoveryEvent } from "./discovery";

const base: DiscoveryEvent = {
  id: "1", slug: "evento", name: "Evento", description: "", cover_image_url: null,
  starts_at: "2026-08-21T03:00:00.000Z", currency: "ARS", venue_name: "Club",
  venue_address: "Calle 1", city: "Mendoza", province: "Mendoza",
  timezone: "America/Argentina/Mendoza", from_price_amount: 1000000, has_availability: true,
};

describe("discovery filters", () => {
  const now = new Date("2026-08-20T15:00:00.000Z");

  it("normalizes shareable URL filters", () => {
    expect(parseDiscoveryFilters({ city: " Córdoba ", when: "weekend" })).toEqual({ city: "cordoba", when: "weekend" });
    expect(parseDiscoveryFilters({ when: "invalid" }).when).toBe("all");
  });

  it("filters cities without depending on accents or case", () => {
    const events = [base, { ...base, id: "2", city: "Córdoba" }];
    expect(filterDiscoveryEvents(events, { city: "cordoba", when: "all" }, now).map(event => event.id)).toEqual(["2"]);
    expect(getDiscoveryCities(events)).toEqual([{ value: "cordoba", label: "Córdoba" }, { value: "mendoza", label: "Mendoza" }]);
  });

  it("matches today and tomorrow in the venue timezone", () => {
    expect(matchesWhen({ ...base, starts_at: "2026-08-21T02:30:00.000Z" }, "today", now)).toBe(true);
    expect(matchesWhen({ ...base, starts_at: "2026-08-21T04:00:00.000Z" }, "tomorrow", now)).toBe(true);
  });

  it("defines this weekend as Friday through Sunday locally", () => {
    expect(matchesWhen({ ...base, starts_at: "2026-08-22T03:00:00.000Z" }, "weekend", now)).toBe(true);
    expect(matchesWhen({ ...base, starts_at: "2026-08-24T03:00:00.000Z" }, "weekend", now)).toBe(false);
  });

  it("orders filtered events chronologically", () => {
    const later = { ...base, id: "2", starts_at: "2026-08-23T03:00:00.000Z" };
    expect(filterDiscoveryEvents([later, base], { when: "all" }, now).map(event => event.id)).toEqual(["1", "2"]);
  });
});

describe("starting price", () => {
  it("uses only positive, active, open and available public types", () => {
    expect(getStartingPrice([
      { price_amount: 100, active: true, sale_open: true, available_quantity: 20, publicly_available: false },
      { price_amount: 0, active: true, sale_open: true, available_quantity: 20 },
      { price_amount: 1000000, active: true, sale_open: false, available_quantity: 20 },
      { price_amount: 1300000, active: true, sale_open: true, available_quantity: 10 },
      { price_amount: 1600000, active: true, sale_open: true, available_quantity: 30 },
    ])).toBe(1300000);
  });
});
