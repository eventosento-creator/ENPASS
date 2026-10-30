import { describe, expect, it } from "vitest";
import { buildScannerLink, readPinFromHash, scannerWhatsappUrl } from "./scanner-link";

describe("scanner activation link", () => {
  it("puts the PIN in the fragment, never in the query string", () => {
    const link = buildScannerLink("https://enpass.example", "123456");
    expect(link).toBe("https://enpass.example/scan#pin=123456");
    expect(link).not.toContain("?");
  });
  it("reads a 6-digit PIN back from the hash", () => {
    expect(readPinFromHash("#pin=123456")).toBe("123456");
    expect(readPinFromHash("#a=1&pin=000123")).toBe("000123");
  });
  it("ignores anything that is not a 6-digit PIN", () => {
    for (const hash of ["", "#", "#pin=12345", "#pin=1234567", "#pin=abcdef", "#xpin=123456"]) expect(readPinFromHash(hash)).toBe("");
  });
  it("builds a WhatsApp message that carries the link and the event name", () => {
    const url = scannerWhatsappUrl("https://enpass.example", "123456", "Noche 2000");
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    const text = decodeURIComponent(url.split("text=")[1] ?? "");
    expect(text).toContain("Noche 2000");
    expect(text).toContain("https://enpass.example/scan#pin=123456");
  });
});
