import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nightlife Access",
    short_name: "NL Access",
    description: "Scanner operativo de accesos para eventos",
    start_url: "/scan",
    display: "standalone",
    orientation: "portrait",
    background_color: "#070708",
    theme_color: "#070708",
    icons: [{ src: "/scanner-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
