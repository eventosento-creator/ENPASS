import type { NextConfig } from "next";

const storageUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL) : null;

const nextConfig: NextConfig = {
  typedRoutes: true,
  // Por defecto un envío a una Server Action admite solo 1 MB: el logo y la portada del club son imágenes.
  // El tope real es el de Vercel (4,5 MB por request); los límites por archivo en la acción dejan margen.
  experimental: { serverActions: { bodySizeLimit: "4.4mb" } },
  allowedDevOrigins: ["127.0.0.1"],
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
