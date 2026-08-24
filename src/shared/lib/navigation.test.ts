import { describe, expect, it } from "vitest";
import { safeAuthPath, safeProducerPath } from "./navigation";

describe("safeProducerPath", () => {
  it("preserves valid producer intent", () => {
    expect(safeProducerPath("/app/events/new")).toBe("/app/events/new");
    expect(safeProducerPath("/app?tab=events")).toBe("/app?tab=events");
  });

  it("rejects external and lookalike redirects", () => {
    expect(safeProducerPath("https://example.com")).toBe("/app");
    expect(safeProducerPath("//example.com/app")).toBe("/app");
    expect(safeProducerPath("/application/admin")).toBe("/app");
    expect(safeProducerPath("/app\\evil")).toBe("/app");
  });
});

describe("safeAuthPath", () => {
  it("allows the password recovery destination", () => {
    expect(safeAuthPath("/actualizar-clave")).toBe("/actualizar-clave");
  });

  it("keeps rejecting external redirects", () => {
    expect(safeAuthPath("https://example.com/actualizar-clave")).toBe("/app");
  });
});
