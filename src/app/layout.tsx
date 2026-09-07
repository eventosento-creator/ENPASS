import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: { default: "ENPASS — Eventos y entradas", template: "%s · ENPASS" },
  description: "Descubrí eventos, comprá entradas u organizá tu próxima fecha con ENPASS.",
  openGraph: { type: "website", locale: "es_AR", siteName: "ENPASS", title: "ENPASS — Eventos y entradas", description: "Eventos y entradas, sin vueltas." },
  twitter: { card: "summary_large_image", title: "ENPASS — Eventos y entradas", description: "Eventos y entradas, sin vueltas." },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es" data-scroll-behavior="smooth" suppressHydrationWarning><head><Script id="enpass-theme" strategy="beforeInteractive">{`try{const saved=localStorage.getItem('enpass-theme');const theme=saved==='light'||saved==='dark'?saved:(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme}catch{document.documentElement.dataset.theme='dark'}`}</Script></head><body>{children}</body></html>;
}
