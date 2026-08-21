import type { Metadata } from "next";
import "./globals.css";

const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: { default: "Nightlife OS — Eventos y entradas", template: "%s · Nightlife OS" },
  description: "Descubrí eventos, comprá entradas o publicá tu propia fecha en Nightlife OS.",
  openGraph: { type: "website", locale: "es_AR", siteName: "Nightlife OS", title: "Nightlife OS — Eventos y entradas", description: "Fiestas, fechas y eventos cerca tuyo." },
  twitter: { card: "summary_large_image", title: "Nightlife OS — Eventos y entradas", description: "Fiestas, fechas y eventos cerca tuyo." },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
