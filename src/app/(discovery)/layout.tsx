import { PublicFooter, PublicHeader } from "@/modules/discovery/ui/public-header";

export default function DiscoveryLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen"><PublicHeader/>{children}<PublicFooter/></div>;
}
