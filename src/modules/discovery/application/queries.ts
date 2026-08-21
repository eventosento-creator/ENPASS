import { cache } from "react";
import { createClient } from "@/shared/database/server";
import type { DiscoveryEvent } from "../domain/discovery";

export const getPublicDiscoveryEvents = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_events_discovery");
  if (error) throw new Error("No pudimos cargar los eventos públicos.");
  return (data ?? []) as DiscoveryEvent[];
});
