import { describe, expect, it } from "vitest";
import { buildCarnetManifest, initialsOf, memberCardStatus, memberCardTheme, qrSecondsLeft } from "./member-card";

describe("memberCardStatus", () => {
  it("al día", () => expect(memberCardStatus({ memberStatus: "active", overdueCount: 0, debtBlocksEntry: true })).toMatchObject({ kind: "ok", blocked: false, label: "Al día" }));
  it("suspendido no pasa", () => expect(memberCardStatus({ memberStatus: "suspended", overdueCount: 0, debtBlocksEntry: false })).toMatchObject({ kind: "suspended", blocked: true }));
  it("con deuda en un club que bloquea el ingreso no pasa", () => expect(memberCardStatus({ memberStatus: "active", overdueCount: 2, debtBlocksEntry: true })).toMatchObject({ kind: "blocked", blocked: true }));
  it("con deuda en un club que no bloquea sí pasa, avisando", () => expect(memberCardStatus({ memberStatus: "active", overdueCount: 1, debtBlocksEntry: false })).toMatchObject({ kind: "overdue", blocked: false }));
});

describe("qrSecondsLeft", () => {
  const now = 1_800_000_000_000;
  it("calcula lo que le queda", () => expect(qrSecondsLeft("NLOSM1:11111111-1111-4111-8111-111111111111.1800000060.abcdefghijklmnopqrstuv", now)).toBe(60));
  it("0 si venció", () => expect(qrSecondsLeft("NLOSM1:11111111-1111-4111-8111-111111111111.1799999999.abcdefghijklmnopqrstuv", now)).toBe(0));
  it("0 si no se puede leer", () => { expect(qrSecondsLeft("basura", now)).toBe(0); expect(qrSecondsLeft(null, now)).toBe(0); });
});

describe("tema, iniciales y manifiesto", () => {
  it("usa el color del club y elige texto que contraste", () => {
    expect(memberCardTheme("#ffffff").onAccent).toBe("#0a0a0b");
    expect(memberCardTheme("#10203a").onAccent).toBe("#ffffff");
  });
  it("sin color usa un negro neutro", () => expect(memberCardTheme(null).accent).toBe("#0a0a0b"));
  it("iniciales", () => { expect(initialsOf("Club Atlético Obras")).toBe("CO"); expect(initialsOf("Obras")).toBe("O"); expect(initialsOf("  ")).toBe("C"); });
  it("el manifiesto abre el carnet de ese club con su alcance", () => {
    const manifest = buildCarnetManifest({ slug: "club-obras", name: "Club Atlético Obras Sanitarias", accentColor: "#10203a" });
    expect(manifest).toMatchObject({ display: "standalone", start_url: "/mi-club/club-obras/carnet?origen=app", scope: "/mi-club/club-obras/", theme_color: "#10203a" });
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
    expect(manifest.icons.map((icon) => icon.sizes)).toContain("512x512");
  });
});
