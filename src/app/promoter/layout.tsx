import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Panel RRPP",
  description: "Tu link, tus ventas y tu comisión.",
  robots: { index: false, follow: false },
};

export default function PromoterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
