import { describe, expect, it } from "vitest";
import { evaluateEventReadiness, type ReadinessInput } from "./event-readiness";

const ready: ReadinessInput = {
  eventId: "e1", status: "published", capabilities: { tickets: true, access: true, pos: true },
  ticketTypes: [{ id: "t1", name: "General", active: true, price_amount: 1_000_000 }],
  gates: [{ id: "g1", active: true }], rules: [{ access_gate_id: "g1", ticket_type_id: "t1" }],
  activatedScanners: 1, payment: { mercadoPagoConnected: true, transferEnabled: false },
  boxOffice: { enabled: false, registers: 0, registersWithCashier: 0 },
};
const keys = (result: ReturnType<typeof evaluateEventReadiness>, level: string) => result.items.filter((item) => item.level === level).map((item) => item.key);

describe("evaluateEventReadiness", () => {
  it("un evento completo está listo", () => {
    const result = evaluateEventReadiness(ready);
    expect(result.ready).toBe(true);
    expect(result.errors + result.warnings).toBe(0);
  });

  it("un borrador no está publicado", () => {
    expect(keys(evaluateEventReadiness({ ...ready, status: "draft" }), "error")).toContain("published");
  });

  it("sin entradas activas no hay nada a la venta", () => {
    const result = evaluateEventReadiness({ ...ready, ticketTypes: [{ id: "t1", name: "General", active: false, price_amount: 1 }] });
    expect(keys(result, "error")).toContain("tickets");
  });

  it("entradas pagas sin cobro configurado es un error; con transferencia o gratis no", () => {
    expect(keys(evaluateEventReadiness({ ...ready, payment: { mercadoPagoConnected: false, transferEnabled: false } }), "error")).toContain("payment");
    expect(keys(evaluateEventReadiness({ ...ready, payment: { mercadoPagoConnected: false, transferEnabled: true } }), "error")).not.toContain("payment");
    const free = evaluateEventReadiness({ ...ready, ticketTypes: [{ id: "t1", name: "Gratis", active: true, price_amount: 0 }], payment: { mercadoPagoConnected: false, transferEnabled: false } });
    expect(keys(free, "error")).not.toContain("payment");
  });

  it("sin puertas o con todas desactivadas, nadie entra", () => {
    expect(keys(evaluateEventReadiness({ ...ready, gates: [], rules: [] }), "error")).toContain("gates");
    expect(keys(evaluateEventReadiness({ ...ready, gates: [{ id: "g1", active: false }] }), "error")).toContain("gates");
  });

  it("detecta la entrada creada después de las puertas y la nombra", () => {
    const result = evaluateEventReadiness({ ...ready, ticketTypes: [...ready.ticketTypes, { id: "t2", name: "Puerta Principal", active: true, price_amount: 500_000 }] });
    const item = result.items.find((entry) => entry.key === "coverage");
    expect(item?.level).toBe("error");
    expect(item?.detail).toContain("Puerta Principal");
    expect(result.ready).toBe(false);
  });

  it("sin scanner activado es una advertencia, no un error", () => {
    const result = evaluateEventReadiness({ ...ready, activatedScanners: 0 });
    expect(keys(result, "warning")).toContain("scanner");
    expect(result.errors).toBe(0);
    expect(result.ready).toBe(false);
  });

  it("la taquilla solo se evalúa si está habilitada", () => {
    expect(evaluateEventReadiness(ready).items.some((item) => item.key === "boxoffice")).toBe(false);
    const noRegister = evaluateEventReadiness({ ...ready, boxOffice: { enabled: true, registers: 0, registersWithCashier: 0 } });
    expect(keys(noRegister, "warning")).toContain("boxoffice");
    const noCashier = evaluateEventReadiness({ ...ready, boxOffice: { enabled: true, registers: 2, registersWithCashier: 0 } });
    expect(noCashier.items.find((item) => item.key === "boxoffice")?.title).toContain("cajero");
    const okBox = evaluateEventReadiness({ ...ready, boxOffice: { enabled: true, registers: 1, registersWithCashier: 1 } });
    expect(okBox.ready).toBe(true);
  });

  it("no evalúa lo que el evento no usa", () => {
    const result = evaluateEventReadiness({ ...ready, capabilities: { tickets: false, access: false, pos: false } });
    expect(result.items.map((item) => item.key)).toEqual(["published"]);
  });
});
