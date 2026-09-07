import { describe, expect, it } from "vitest";
import { changeEventProfile, getDefaultCapabilitiesForProfile } from "./event-profile";

describe("event profiles", () => {
  it("enables the full existing journey for nightlife", () => {
    expect(getDefaultCapabilitiesForProfile("nightlife")).toEqual({
      tickets: true, promoters: true, tables: true, access: true, pos: true, inventory: false,
    });
  });

  it("keeps conference focused on tickets and access", () => {
    expect(getDefaultCapabilitiesForProfile("conference")).toEqual({
      tickets: true, promoters: false, tables: false, access: true, pos: false, inventory: false,
    });
  });

  it("allows an other profile to use explicit custom capabilities", () => {
    const custom = { ...getDefaultCapabilitiesForProfile("other"), promoters: true, tickets: false };
    expect(custom).toMatchObject({ tickets: false, promoters: true, tables: false, access: true });
  });

  it("changes profile metadata without replacing explicit capabilities", () => {
    const event = { profile: "concert" as const, capabilities: { tickets: true, promoters: false, tables: true, access: true, pos: false, inventory: false } };
    expect(changeEventProfile(event, "private_event")).toEqual({ ...event, profile: "private_event" });
  });

  it("returns fresh preset objects", () => {
    const first = getDefaultCapabilitiesForProfile("nightlife");
    first.tables = false;
    expect(getDefaultCapabilitiesForProfile("nightlife").tables).toBe(true);
  });
});
