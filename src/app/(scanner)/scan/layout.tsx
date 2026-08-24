import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Scanner de accesos",
  description: "Control operativo de accesos Nightlife OS",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#090909" };

export default function ScannerLayout({ children }: { children: React.ReactNode }) {
  return <main className="min-h-dvh bg-[#070708]">{children}</main>;
}
