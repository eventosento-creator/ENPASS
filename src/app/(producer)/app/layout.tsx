import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, Home, LogOut, Settings } from "lucide-react";
import { createClient } from "@/shared/database/server";
import { logout } from "@/modules/identity/application/actions";

export default async function ProducerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  return <div className="min-h-screen pb-24 md:pb-0 md:pl-60">
    <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-white/[.07] bg-[#0c0c0e] p-5 md:flex md:flex-col">
      <span className="px-3 text-[15px] font-black tracking-[-.03em]">NIGHTLIFE OS</span><nav className="mt-10 grid gap-1"><Nav href="/app" icon={<Home size={18}/>} label="Inicio"/><Nav href="/app/events" icon={<CalendarDays size={18}/>} label="Eventos"/></nav>
      <div className="mt-auto grid gap-1"><Nav href="/app/venues" icon={<Settings size={17}/>} label="Configuración"/><form action={logout}><button className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-neutral-600 hover:text-white"><LogOut size={16}/> Salir</button></form></div>
    </aside>
    <header className="border-b border-white/[.07] px-4 py-4 md:hidden"><span className="font-black tracking-[-.03em]">NIGHTLIFE OS</span></header>
    <main className="container-shell py-7 sm:py-10">{children}</main>
    <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 border-t border-white/[.08] bg-[#0c0c0e]/95 p-2 backdrop-blur md:hidden"><MobileNav href="/app" icon={<Home/>} label="Inicio"/><MobileNav href="/app/events" icon={<CalendarDays/>} label="Eventos"/><MobileNav href="/app/venues" icon={<Settings/>} label="Ajustes"/></nav>
  </div>;
}
function Nav({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) { return <Link className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-neutral-400 hover:bg-white/[.05] hover:text-white" href={href as "/app"}>{icon}{label}</Link>; }
function MobileNav({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) { return <Link className="grid place-items-center gap-1 rounded-lg p-1 text-xs text-neutral-400" href={href as "/app"}><span className="[&>svg]:size-5">{icon}</span>{label}</Link>; }
