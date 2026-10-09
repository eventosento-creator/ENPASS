import type { NextConfig } from "next";

const storageUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL) : null;

const isProduction = process.env.NODE_ENV === "production";

// Política de contenido. Next inyecta scripts y estilos en línea para hidratar la página (sin nonces), por eso 'unsafe-inline';
// igual limita de dónde se cargan scripts/imágenes/conexiones, impide que embeban la web y fija la base de las URLs.
// Google Analytics (etiqueta + envío de eventos) y las imágenes del storage de Supabase son los únicos orígenes externos.
const analyticsHosts = ["https://www.googletagmanager.com", "https://*.google-analytics.com", "https://*.analytics.google.com", "https://*.g.doubleclick.net"];
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"} https://www.googletagmanager.com`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${[storageUrl?.origin, ...analyticsHosts].filter(Boolean).join(" ")}`,
  "font-src 'self' data:",
  `connect-src 'self' ${analyticsHosts.join(" ")}${isProduction ? "" : " ws: wss:"}`,
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // La cámara es del scanner y la ubicación del buscador de eventos cercanos; el resto queda apagado.
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=(), payment=(), usb=(), interest-cohort=()" },
  ...(isProduction ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] : []),
];

const nextConfig: NextConfig = {
  typedRoutes: true,
  // Por defecto un envío a una Server Action admite solo 1 MB: el logo y la portada del club son imágenes.
  // El tope real es el de Vercel (4,5 MB por request); los límites por archivo en la acción dejan margen.
  experimental: { serverActions: { bodySizeLimit: "4.4mb" } },
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  images: {
    remotePatterns: storageUrl ? [{
      protocol: storageUrl.protocol.replace(":", "") as "http" | "https",
      hostname: storageUrl.hostname,
      port: storageUrl.port,
      pathname: "/storage/v1/object/public/event-covers/**",
    }] : [],
  },
};

export default nextConfig;
