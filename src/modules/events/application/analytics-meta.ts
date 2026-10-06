import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/shared/database/admin";

export type EventAnalyticsMeta = { item_category: string; item_category2: string; item_brand: string };

/** Datos públicos del evento para los items de GA4: categoría, ciudad y organizador (club o productor). */
export const getEventAnalyticsMeta = cache(async (slug: string): Promise<EventAnalyticsMeta> => {
  const admin = createAdminClient();
  const { data: event } = await admin.from("events").select("discovery_category, organization_id, venue_id").eq("slug", slug).maybeSingle();
  if (!event) return { item_category: "", item_category2: "", item_brand: "" };
  const [{ data: organization }, { data: venue }] = await Promise.all([
    admin.from("organizations").select("name").eq("id", event.organization_id).maybeSingle(),
    admin.from("venues").select("city").eq("id", event.venue_id).maybeSingle(),
  ]);
  return { item_category: event.discovery_category, item_category2: venue?.city ?? "", item_brand: organization?.name ?? "" };
});
