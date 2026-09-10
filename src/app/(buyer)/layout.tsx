import { PublicFooter } from "@/modules/discovery/ui/public-header";

export default function BuyerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}<PublicFooter/></>;
}
