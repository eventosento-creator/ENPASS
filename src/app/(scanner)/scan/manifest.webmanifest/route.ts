import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    name: "ENPASS Access",
    short_name: "NL Access",
    description: "Scanner operativo de accesos para eventos",
    start_url: "/scan",
    display: "standalone",
    orientation: "portrait",
    background_color: "#070708",
    theme_color: "#070708",
    icons: [{ src: "/scanner-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  }, { headers: { "Content-Type": "application/manifest+json" } });
}
