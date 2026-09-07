import type { Metadata, Viewport } from "next";

export const metadata: Metadata = { title: "Punto de venta", description: "Operación POS ENPASS", robots: { index: false, follow: false } };
export const viewport: Viewport = { themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f4f4f0" }, { media: "(prefers-color-scheme: dark)", color: "#070707" }] };
export default function PosLayout({ children }: { children: React.ReactNode }) { return children; }
