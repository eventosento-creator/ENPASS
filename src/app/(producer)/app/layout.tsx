import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/shared/database/server";
import { logout } from "@/modules/identity/application/actions";
import { ProducerNavigation } from "@/modules/organizations/ui/producer-navigation";

export default async function ProducerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  return <div className="min-h-screen pb-24 md:pb-0 md:pl-60">
    <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-white/[.07] bg-[#0c0c0e] p-5 md:flex md:flex-col">
      <Link href="/app" className="px-3 text-[15px] font-black tracking-[-.03em]">NIGHTLIFE OS</Link><p className="mt-2 px-3 text-[10px] font-bold uppercase tracking-[.14em] text-neutral-700">Panel productor</p><div className="mt-9"><ProducerNavigation/></div>
      <form action={logout} className="mt-auto"><button className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm text-neutral-600 transition hover:bg-white/[.04] hover:text-white"><LogOut size={16}/> Cerrar sesión</button></form>
    </aside>
    <header className="border-b border-white/[.07] px-4 py-4 md:hidden"><Link href="/app" className="font-black tracking-[-.03em]">NIGHTLIFE OS</Link></header>
    <main className="container-shell py-7 sm:py-10">{children}</main>
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/[.08] bg-[#0c0c0e]/95 px-2 pt-2 pb-[max(.5rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden"><ProducerNavigation mobile/></div>
  </div>;
}
