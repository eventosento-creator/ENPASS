export type ScannerPresence = "online" | "slow" | "offline" | "inactive";

const ONLINE_MS = 90_000;
const SLOW_MS = 5 * 60_000;

/** Estado de un celular de puerta según cuándo fue la última vez que habló con el servidor. */
export function scannerPresence(input: { activated: boolean; revoked: boolean; sessionExpiresAt: string | null; lastSeenAt: string | null }, now = Date.now()): ScannerPresence {
  if (input.revoked || !input.activated) return "inactive";
  if (!input.lastSeenAt || (input.sessionExpiresAt && new Date(input.sessionExpiresAt).getTime() <= now)) return "offline";
  const elapsed = now - new Date(input.lastSeenAt).getTime();
  return elapsed <= ONLINE_MS ? "online" : elapsed <= SLOW_MS ? "slow" : "offline";
}

export const presenceLabels: Record<ScannerPresence, string> = { online: "En línea", slow: "Con demora", offline: "Sin señal", inactive: "Sin activar" };

/** "hace 12 s", "hace 3 min", "hace 2 h". */
export function timeAgo(value: string | null, now = Date.now()) {
  if (!value) return "nunca";
  const seconds = Math.max(0, Math.round((now - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `hace ${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  return `hace ${Math.round(minutes / 60)} h`;
}

export type LiveAlert = { key: string; level: "error" | "warning"; title: string; detail: string; href?: string; action?: string };

/** Alertas del evento en vivo: lo que hay que mirar ahora, ordenado de lo más grave a lo menos. */
export function buildLiveAlerts(input: {
  eventId: string;
  doorsOpen: boolean;
  scanners: { presence: ScannerPresence }[];
  wrongGateRecent: number;
  configErrors: number;
  rejectedRecent: number;
}): LiveAlert[] {
  const base = `/app/events/${input.eventId}`;
  const alerts: LiveAlert[] = [];
  if (input.configErrors > 0) alerts.push({ key: "config", level: "error", title: "Hay un problema de configuración", detail: "Algunas entradas o puertas no están bien armadas: puede haber gente que no pueda ingresar.", href: base, action: "Ver qué falta" });
  if (input.wrongGateRecent >= 2) alerts.push({ key: "wrong-gate", level: "error", title: `${input.wrongGateRecent} entradas rechazadas por puerta en los últimos 30 min`, detail: "Probablemente una entrada no está aceptada en esa puerta. Revisá Accesos.", href: `${base}/access`, action: "Revisar puertas" });
  if (input.doorsOpen) {
    const online = input.scanners.filter((scanner) => scanner.presence === "online").length;
    if (input.scanners.length === 0) alerts.push({ key: "no-scanners", level: "warning", title: "No hay ningún scanner activado", detail: "Generá un PIN en Accesos y cargalo en el celular de la puerta.", href: `${base}/access`, action: "Generar PIN" });
    else if (online === 0) alerts.push({ key: "all-offline", level: "error", title: "Ningún scanner está en línea", detail: "Ningún celular de puerta habló con el servidor hace más de un minuto y medio. Revisá la señal.", href: `${base}/access`, action: "Ver dispositivos" });
  }
  if (input.rejectedRecent >= 8 && input.wrongGateRecent < 2) alerts.push({ key: "rejections", level: "warning", title: `${input.rejectedRecent} lecturas rechazadas en los últimos 30 min`, detail: "Mirá los últimos movimientos para ver el motivo.", href: `${base}/access`, action: "Ver movimientos" });
  return alerts;
}

/** ¿El evento está "en juego"? Desde 6 h antes del inicio hasta 12 h después del fin (o del inicio si no tiene fin). */
export function isEventLiveWindow(startsAt: string, endsAt: string | null, now = Date.now()) {
  const start = new Date(startsAt).getTime();
  const end = endsAt ? new Date(endsAt).getTime() : start + 6 * 3600_000;
  return now >= start - 6 * 3600_000 && now <= end + 12 * 3600_000;
}
