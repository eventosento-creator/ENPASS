import { describe, expect, it } from "vitest";
import { formatHoldCountdown, getRemainingHoldSeconds } from "./hold";

describe("hold countdown", () => {
  it("computes the remaining whole seconds", () => {
    const now = Date.parse("2026-08-20T12:00:00.000Z");
    expect(getRemainingHoldSeconds("2026-08-20T12:10:00.000Z", now)).toBe(600);
  });

  it("never returns a negative duration", () => {
    const now = Date.parse("2026-08-20T12:10:01.000Z");
    expect(getRemainingHoldSeconds("2026-08-20T12:10:00.000Z", now)).toBe(0);
  });

  it("formats a compact reservation countdown", () => {
    expect(formatHoldCountdown(599)).toBe("09:59");
    expect(formatHoldCountdown(0)).toBe("00:00");
  });
});
