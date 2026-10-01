/** URL "universal" de Google Maps (funciona sin API key, abre la app en el celu o el browser
 * en desktop) para poder ir hasta el lugar desde la entrada/evento/mail. */
export function googleMapsUrl(venue: { name: string; address: string; city?: string }) {
  const query = [venue.name, venue.address, venue.city].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
