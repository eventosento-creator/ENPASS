"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, LogIn, Ticket } from "lucide-react";
import { EnpassLogo } from "@/shared/ui/brand";
import { ThemeToggle } from "@/shared/ui/theme-toggle";

export function PublicHeader() {
  const pathname = usePathname();
  const isEventos = pathname === "/eventos" || pathname?.startsWith("/e/");
  const isMisEntradas = pathname?.startsWith("/mis-entradas") || pathname?.startsWith("/order/");
  return <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[color:var(--background)]/90 backdrop-blur-xl">
    <div className="container-shell flex h-16 items-center justify-between gap-2">
      <Link href="/" className="shrink-0"><EnpassLogo/></Link>
      <nav aria-label="Navegación principal" className="flex items-center gap-0.5 text-sm sm:gap-1">
        <NavTab active={isEventos} href="/eventos" label="Eventos" icon={CalendarDays}/>
        <NavTab active={isMisEntradas} href={"/mis-entradas" as never} label="Mis entradas" icon={Ticket} labelClassName="hidden lg:inline"/>
        <ThemeToggle className="rounded-full"/>
        <Link aria-label="Ingresar para crear eventos" className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/[.08] px-2.5 py-2 text-neutral-400 transition hover:border-white/[.14] hover:text-white sm:ml-1 sm:px-3" href="/login"><LogIn aria-hidden size={16}/><span className="hidden md:inline">Crear evento</span></Link>
      </nav>
    </div>
  </header>;
}

function NavTab({ active, href, label, icon: Icon, labelClassName = "hidden sm:inline" }: { active: boolean; href: Parameters<typeof Link>[0]["href"]; label: string; icon: typeof CalendarDays; labelClassName?: string }) {
  return <Link
    aria-label={label}
    aria-current={active ? "page" : undefined}
    className={`inline-flex min-h-10 items-center gap-2 rounded-full px-2.5 py-2 transition sm:px-3 ${active ? "bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow-xs)]" : "text-neutral-400 hover:bg-white/[.05] hover:text-white"}`}
    href={href}
  ><Icon aria-hidden size={16}/><span className={labelClassName}>{label}</span></Link>;
}

export function PublicFooter() {
  return <footer className="container-shell flex flex-col gap-3 border-t border-white/[.07] py-8 text-xs text-neutral-600 sm:flex-row sm:items-center sm:justify-between">
    <EnpassLogo/>
    <div className="flex flex-wrap gap-5"><Link href="/eventos" className="hover:text-white">Eventos</Link><Link href={"/mis-entradas" as never} className="hover:text-white">Mis entradas</Link><Link href="/crear-evento" className="hover:text-white">Crear eventos</Link><Link href="/login" className="hover:text-white">Ingresar</Link></div>
  </footer>;
}
