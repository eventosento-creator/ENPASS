import { describe, expect, it } from "vitest";
import { buildLiveAlerts, isEventLiveWindow, scannerPresence, timeAgo } from "./event-live";

const NOW = new Date("2026-10-24T23:00:00Z").getTime();
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("scannerPresence", () => {
  const base = { activated: true, revoked: false, sessionExpiresAt: new Date(NOW + 3_600_000).toISOString() };
  it("en línea si habló hace menos de 90 segundos", () => expect(scannerPresence({ ...base, lastSeenAt: ago(20_000) }, NOW)).toBe("online"));
  it("con demora entre 90 segundos y 5 minutos", () => expect(scannerPresence({ ...base, lastSeenAt: ago(3 * 60_000) }, NOW)).toBe("slow"));
  it("sin señal pasados 5 minutos", () => expect(scannerPresence({ ...base, lastSeenAt: ago(10 * 60_000) }, NOW)).toBe("offline"));
  it("sin señal si la sesión ya venció", () => expect(scannerPresence({ ...base, sessionExpiresAt: ago(1000), lastSeenAt: ago(1000) }, NOW)).toBe("offline"));
  it("sin activar o revocado", () => {
    expect(scannerPresence({ ...base, activated: false, lastSeenAt: null }, NOW)).toBe("inactive");
    expect(scannerPresence({ ...base, revoked: true, lastSeenAt: ago(1000) }, NOW)).toBe("inactive");
  });
});

describe("timeAgo", () => {
  it("formatea segundos, minutos y horas", () => {
    expect(timeAgo(ago(12_000), NOW)).toBe("hace 12 s");
    expect(timeAgo(ago(3 * 60_000), NOW)).toBe("hace 3 min");
    expect(timeAgo(ago(2 * 3600_000), NOW)).toBe("hace 2 h");
    expect(timeAgo(null, NOW)).toBe("nunca");
  });
});

describe("buildLiveAlerts", () => {
  const quiet = { eventId: "e1", doorsOpen: true, scanners: [{ presence: "online" as const }], wrongGateRecent: 0, configErrors: 0, rejectedRecent: 0 };
  it("sin problemas no hay alertas", () => expect(buildLiveAlerts(quiet)).toEqual([]));
  it("avisa de un problema de configuración primero", () => expect(buildLiveAlerts({ ...quiet, configErrors: 1, wrongGateRecent: 3 })[0]?.key).toBe("config"));
  it("varias entradas rechazadas por puerta sugieren una entrada sin puerta", () => expect(buildLiveAlerts({ ...quiet, wrongGateRecent: 2 }).map((alert) => alert.key)).toContain("wrong-gate"));
  it("ningún scanner en línea es grave; ninguno activado es recomendación", () => {
    expect(buildLiveAlerts({ ...quiet, scanners: [{ presence: "offline" }] })[0]).toMatchObject({ key: "all-offline", level: "error" });
    expect(buildLiveAlerts({ ...quiet, scanners: [] })[0]).toMatchObject({ key: "no-scanners", level: "warning" });
  });
  it("con la puerta cerrada no alerta por scanners", () => expect(buildLiveAlerts({ ...quiet, doorsOpen: false, scanners: [] })).toEqual([]));
  it("muchas lecturas rechazadas sin patrón de puerta dan un aviso suave", () => expect(buildLiveAlerts({ ...quiet, rejectedRecent: 9 })[0]?.key).toBe("rejections"));
});

describe("isEventLiveWindow", () => {
  const start = new Date(NOW + 2 * 3600_000).toISOString();
  it("está en juego desde 6 horas antes", () => expect(isEventLiveWindow(start, null, NOW)).toBe(true));
  it("no lo está una semana antes", () => expect(isEventLiveWindow(new Date(NOW + 7 * 86_400_000).toISOString(), null, NOW)).toBe(false));
  it("deja de estarlo 12 horas después del cierre", () => expect(isEventLiveWindow(new Date(NOW - 48 * 3600_000).toISOString(), null, NOW)).toBe(false));
});
