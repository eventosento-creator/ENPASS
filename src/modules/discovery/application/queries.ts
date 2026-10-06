import { cache } from "react";
import { after } from "next/server";
import { createClient } from "@/shared/database/server";
import type { DiscoveryEvent } from "../domain/discovery";
import { backfillVenueCoordinates } from "../infrastructure/geocode";

export const getPublicDiscoveryEvents = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_events_discovery");
  if (error) throw new Error("No pudimos cargar los eventos públicos.");
  const events = (data ?? []) as DiscoveryEvent[];
  // Lugares sin coordenadas: se geocodifican en segundo plano, sin demorar la página.
  if (events.some((event) => event.latitude == null)) after(() => backfillVenueCoordinates().catch(() => undefined));
  return events;
});
