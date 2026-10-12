import type { Metadata } from "next";
import Script from "next/script";
import { GoogleAnalytics } from "@next/third-parties/google";
import { AnalyticsGate } from "@/shared/ui/analytics-gate";
import { MetaPixel } from "@/shared/ui/meta-pixel";
import { META_PIXEL_ID } from "@/shared/lib/meta-pixel-config";
import "./globals.css";

// Google Analytics 4: solo en producción y solo si hay ID cargado (NEXT_PUBLIC_GA_ID).
const gaId = process.env.NODE_ENV === "production" ? process.env.NEXT_PUBLIC_GA_ID : undefined;
// Pixel de Meta (pauta): solo en producción.
const metaPixelId = process.env.NODE_ENV === "production" ? META_PIXEL_ID : undefined;
const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: { default: "ENPASS — Eventos y entradas", template: "%s · ENPASS" },
  description: "Descubrí eventos, comprá entradas u organizá tu próxima fecha con ENPASS.",
  openGraph: { type: "website", locale: "es_AR", siteName: "ENPASS", title: "ENPASS — Eventos y entradas", description: "Eventos y entradas, sin vueltas." },
  twitter: { card: "summary_large_image", title: "ENPASS — Eventos y entradas", description: "Eventos y entradas, sin vueltas." },
  // Verificación del dominio en el Business Manager de Meta (tiene que estar en el HTML del servidor, no por JS):
  // enpass.com.ar y www.enpass.com.ar.
  other: { "facebook-domain-verification": ["2mcpqnu9mz7aezrrjxif0eiesy37rn", "26otbnnkip3f9jze9x000d6xdu8myl"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es" data-scroll-behavior="smooth" suppressHydrationWarning><head><Script id="enpass-theme" strategy="beforeInteractive">{`try{const saved=localStorage.getItem('enpass-theme');const theme=saved==='dark'?'dark':'light';document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme}catch{document.documentElement.dataset.theme='light'}`}</Script></head><body>{children}{gaId && <><AnalyticsGate gaId={gaId}/><GoogleAnalytics gaId={gaId}/></>}{metaPixelId && <MetaPixel pixelId={metaPixelId}/>}</body></html>;
}
