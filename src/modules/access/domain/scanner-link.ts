/**
 * Link para activar un scanner con un toque. El PIN viaja en el fragmento (#pin=…), que el navegador nunca envía al servidor:
 * no queda en registros ni en vistas previas. El PIN sigue siendo de un solo uso y vence a los 30 minutos.
 */
export function buildScannerLink(origin: string, pin: string) {
  return `${origin}/scan#pin=${pin}`;
}

export function readPinFromHash(hash: string) {
  const match = /(?:^#|&)pin=(\d{6})(?:&|$)/.exec(hash);
  return match?.[1] ?? "";
}

export function scannerWhatsappUrl(origin: string, pin: string, eventName: string) {
  const text = `Scanner de ${eventName}: tocá el link para activar la puerta. Sirve una sola vez y vence en 30 minutos.\n${buildScannerLink(origin, pin)}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
