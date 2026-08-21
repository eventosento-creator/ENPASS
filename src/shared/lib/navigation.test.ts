import { describe, expect, it } from "vitest";
import { safeProducerPath } from "./navigation";

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
