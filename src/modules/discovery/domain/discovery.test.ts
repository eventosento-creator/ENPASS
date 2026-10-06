import { describe, expect, it } from "vitest";
import { filterDiscoveryEvents, getDiscoveryCities, formatDistance, getStartingPrice, matchesPrice, parseLocationCookie, sortByProximity, matchesWhen, parseDiscoveryFilters, type DiscoveryEvent } from "./discovery";

const base: DiscoveryEvent = {
  id: "1", slug: "evento", name: "Evento", description: "", cover_image_url: null,
  starts_at: "2026-08-21T03:00:00.000Z", currency: "ARS", venue_name: "Club",
  venue_address: "Calle 1", city: "Mendoza", province: "Mendoza",
  timezone: "America/Argentina/Mendoza", from_price_amount: 1000000, has_availability: true,
  discovery_category: "party", latitude: null, longitude: null,
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
    ])).toBe(0);
  });

  it("filtra por precio: gratis, pago, y deja afuera los que no tienen precio", () => {
    expect(matchesPrice({ from_price_amount: 0 }, "free")).toBe(true);
    expect(matchesPrice({ from_price_amount: 5000 }, "free")).toBe(false);
    expect(matchesPrice({ from_price_amount: 5000 }, "paid")).toBe(true);
    expect(matchesPrice({ from_price_amount: 0 }, "paid")).toBe(false);
    expect(matchesPrice({ from_price_amount: null }, "paid")).toBe(false);
    expect(matchesPrice({ from_price_amount: null }, undefined)).toBe(true);
    expect(parseDiscoveryFilters({ price: "free" }).price).toBe("free");
    expect(parseDiscoveryFilters({ price: "otro" }).price).toBeUndefined();
  });
});

describe("cercanía", () => {
  const mendoza = { lat: -32.89, lng: -68.84 };
  it("ordena del más cercano al más lejano y deja al final los lugares sin coordenadas", () => {
    const events = [
      { ...base, id: "cordoba", latitude: -31.42, longitude: -64.18 },
      { ...base, id: "sin-coords" },
      { ...base, id: "godoy-cruz", latitude: -32.92, longitude: -68.85 },
    ];
    expect(sortByProximity(events, mendoza).map((event) => event.id)).toEqual(["godoy-cruz", "cordoba", "sin-coords"]);
    expect(sortByProximity(events, mendoza)[0]!.distanceKm).toBeLessThan(5);
  });
  it("lee la cookie de ubicación y rechaza valores inválidos", () => {
    expect(parseLocationCookie("-32.89,-68.84")).toEqual(mendoza);
    expect(parseLocationCookie("hola,mundo")).toBeNull();
    expect(parseLocationCookie("999,0")).toBeNull();
    expect(parseLocationCookie(undefined)).toBeNull();
  });
  it("formatea la distancia", () => {
    expect(formatDistance(0.4)).toBe("A menos de 1 km");
    expect(formatDistance(3.46)).toBe("A 3,5 km");
    expect(formatDistance(42.2)).toBe("A 42 km");
  });
});
