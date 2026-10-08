import { describe, expect, it } from "vitest";
import { isAnalyticsExcluded } from "./analytics-gate";

describe("isAnalyticsExcluded", () => {
  it("excluye panel, scanner, caja, RRPP e invitaciones", () => {
    for (const path of ["/app", "/app/events/123", "/app/socios/categorias", "/scan", "/club-scan", "/pos", "/promoter", "/promoter/events/9", "/invite/club", "/dev/qr"]) {
      expect(isAnalyticsExcluded(path), path).toBe(true);
    }
  });
  it("mide la web pública y el recorrido de compra", () => {
    for (const path of ["/", "/eventos", "/e/noche-2000", "/e/noche-2000/checkout", "/order/abc", "/mis-entradas", "/clubes", "/clubes/club-demo", "/login", "/socios/cuota/1", "/appetito"]) {
      expect(isAnalyticsExcluded(path), path).toBe(false);
    }
  });
});
