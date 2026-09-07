import { ImageResponse } from "next/og";

export const alt = "ENPASS — Eventos y entradas";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(<div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#090909", color: "#f7f7f5", padding: 72, position: "relative", overflow: "hidden" }}><div style={{ position: "absolute", width: 620, height: 620, borderRadius: 999, right: -120, top: -260, background: "rgba(255,255,255,.10)", filter: "blur(70px)" }}/><div style={{ display: "flex", fontSize: 28, fontWeight: 800, letterSpacing: -1 }}>ENPASS</div><div style={{ display: "flex", flexDirection: "column", maxWidth: 850 }}><div style={{ color: "#f7f7f5", fontSize: 24, fontWeight: 800, letterSpacing: 4, textTransform: "uppercase" }}>CLARIDAD · DIRECCIÓN · IMPULSO</div><div style={{ marginTop: 20, fontSize: 82, fontWeight: 900, letterSpacing: -5, lineHeight: .95 }}>Eventos y entradas cerca tuyo.</div></div></div>, size);
}
