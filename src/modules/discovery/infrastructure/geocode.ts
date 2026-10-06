import "server-only";
import { createAdminClient } from "@/shared/database/admin";

type Coordinates = { latitude: number; longitude: number };

async function searchNominatim(query: string): Promise<Coordinates | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ar&q=${encodeURIComponent(query)}`;
  try {
    const response = await fetch(url, { headers: { "User-Agent": "ENPASS/1.0 (enpass.gf@gmail.com)", "Accept-Language": "es" }, signal: AbortSignal.timeout(6000) });
    if (!response.ok) return null;
    const [first] = (await response.json()) as Array<{ lat: string; lon: string }>;
    const latitude = Number(first?.lat);
    const longitude = Number(first?.lon);
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
  } catch { return null; }
}

/**
 * Dirección → coordenadas con OpenStreetMap (Nominatim): gratis, sin clave, ≤1 consulta/seg y User-Agent propio.
 * OSM no siempre tiene la numeración de Argentina, así que se prueba: dirección completa → calle sin número → ciudad
 * (la ciudad alcanza para ordenar por zona).
 */
async function geocodeAddress(venue: { address: string; city: string; province: string }): Promise<Coordinates | null> {
  const area = [venue.city, venue.province, "Argentina"].filter(Boolean).join(", ");
  const street = venue.address.replace(/\s+\d+[\w-]*\s*$/, "").trim();
  const attempts = [`${venue.address}, ${area}`, ...(street && street !== venue.address ? [`${street}, ${area}`] : []), area];
  for (const query of attempts) {
    const found = await searchNominatim(query);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 1100));
  }
  return null;
}

/**
 * Completa las coordenadas de unos pocos lugares que todavía no tienen (se llama en segundo plano,
 * después de responder la página). Si no se encuentra la dirección se reintenta recién a los 7 días.
 */
let running = false;

export async function backfillVenueCoordinates(limit = 3) {
  if (running) return; // una sola corrida a la vez por instancia (respeta el límite de Nominatim)
  running = true;
  try { await runBackfill(limit); } finally { running = false; }
}

async function runBackfill(limit: number) {
  const admin = createAdminClient();
  const retryBefore = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: venues } = await admin.from("venues").select("id, address, city, province")
    .is("latitude", null).or(`geocode_attempted_at.is.null,geocode_attempted_at.lt.${retryBefore}`).limit(limit);
  for (const venue of venues ?? []) {
    const coordinates = await geocodeAddress(venue);
    await admin.from("venues").update({ ...(coordinates ?? {}), geocode_attempted_at: new Date().toISOString() }).eq("id", venue.id);
    await new Promise((resolve) => setTimeout(resolve, 1100));
  }
}
