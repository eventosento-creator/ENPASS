import { describe, expect, it } from "vitest";
import { canUseSupervisorTools, getResultPresentation, isNightlifeQrPayload, scannerCheckInSchema } from "./scanner";

describe("scanner domain", () => {
  it("accepts only the issued NLOS1 payload shape", () => {
    expect(isNightlifeQrPayload(`NLOS1:${"A".repeat(43)}`)).toBe(true);
    expect(isNightlifeQrPayload(`NLOS2:${"A".repeat(43)}`)).toBe(false);
    expect(isNightlifeQrPayload("NLOS1:short")).toBe(false);
    expect(scannerCheckInSchema.safeParse({ payload: `NLOS1:${"A".repeat(43)}`, idempotencyKey: crypto.randomUUID() }).success).toBe(true);
    expect(scannerCheckInSchema.safeParse({ payload: "https://example.com", idempotencyKey: crypto.randomUUID() }).success).toBe(false);
  });

  it("keeps supervisor tools unavailable to a normal scanner", () => {
    expect(canUseSupervisorTools("scanner")).toBe(false);
    expect(canUseSupervisorTools("supervisor")).toBe(true);
  });

  it("uses a short green confirmation for valid entries", () => {
    expect(getResultPresentation({ result: "valid", suggested_gate_name: null })).toEqual({
      tone: "success", title: "INGRESO VÁLIDO", detail: "Acceso registrado", durationMs: 1000,
    });
  });

  it("keeps an already-used rejection visible longer", () => {
    expect(getResultPresentation({ result: "already_used", suggested_gate_name: null }).durationMs).toBe(1800);
  });

  it("presents a full group credential as capacity reached", () => {
    expect(getResultPresentation({ result: "already_used", suggested_gate_name: null, max_entries: 8 })).toEqual({
      tone: "danger", title: "CUPO COMPLETO", detail: "8 / 8 ingresos utilizados", durationMs: 1800,
    });
  });

  it("shows the accepted gate without exposing buyer details", () => {
    expect(getResultPresentation({ result: "wrong_gate", suggested_gate_name: "Acceso VIP" }).detail).toBe("Dirigir a Acceso VIP");
  });

  it("maps scanner throttling to a non-destructive warning", () => {
    expect(getResultPresentation({ result: "rate_limited", suggested_gate_name: null }).tone).toBe("warning");
  });
});
