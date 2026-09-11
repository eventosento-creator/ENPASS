import { PublicFooter, PublicHeader } from "@/modules/discovery/ui/public-header";
import { createClient } from "@/shared/database/server";

export default async function DiscoveryLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return <div className="min-h-screen"><PublicHeader isAuthenticated={!!user}/>{children}<PublicFooter/></div>;
}
