import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/shared/database/server";
import { logout } from "@/modules/identity/application/actions";
import { ProducerNavigation } from "@/modules/organizations/ui/producer-navigation";
import { getCurrentOrganization } from "@/modules/organizations/application/queries";

export default async function ProducerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  const organization = await getCurrentOrganization();
  const profileName = typeof data.user.user_metadata.full_name === "string" && data.user.user_metadata.full_name.trim()
    ? data.user.user_metadata.full_name.trim()
    : data.user.email;
  return <div className="min-h-screen pb-24 md:pb-0 md:pl-60">
    <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-white/[.07] bg-[#0c0c0e] p-5 md:flex md:flex-col">
      <Link href="/app" className="px-3 text-[15px] font-black tracking-[-.03em]">NIGHTLIFE OS</Link><p className="mt-7 px-3 text-[10px] font-bold uppercase tracking-[.14em] text-neutral-600">Tu espacio</p><p className="mt-1 truncate px-3 text-lg font-black tracking-[-.03em]">{organization?.name ?? "Creá tu evento"}</p><div className="mt-8"><ProducerNavigation/></div>
      <div className="mt-auto border-t border-white/[.07] pt-4"><p className="truncate px-3 text-xs font-semibold text-neutral-500">{profileName}</p><form action={logout} className="mt-1"><button className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm text-neutral-600 transition hover:bg-white/[.04] hover:text-white"><LogOut size={16}/> Cerrar sesión</button></form></div>
    </aside>
    <header className="flex items-center justify-between gap-4 border-b border-white/[.07] px-4 py-3 md:hidden"><Link href="/app" className="whitespace-nowrap font-black tracking-[-.03em]">NIGHTLIFE OS</Link><span className="truncate text-xs font-bold text-neutral-500">{organization?.name ?? "Tu evento"}</span></header>
    <main className="container-shell py-7 sm:py-10">{children}</main>
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/[.08] bg-[#0c0c0e]/95 px-2 pt-2 pb-[max(.5rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden"><ProducerNavigation mobile/></div>
  </div>;
}
