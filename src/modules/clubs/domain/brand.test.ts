import { describe, expect, it } from "vitest";
import { resolveClubBrand } from "./brand";

describe("identidad del club", () => {
  it("elige texto claro sobre colores oscuros y oscuro sobre claros", () => {
    expect(resolveClubBrand("#0a3d91")?.onAccent).toBe("#ffffff");
    expect(resolveClubBrand("#f2d600")?.onAccent).toBe("#0a0a0b");
  });
  it("ignora colores inválidos o ausentes", () => {
    expect(resolveClubBrand(null)).toBeNull();
    expect(resolveClubBrand("rojo")).toBeNull();
    expect(resolveClubBrand("url(javascript:1)")).toBeNull();
  });
});
