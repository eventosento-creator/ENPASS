"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, LogIn, Mail, Ticket } from "lucide-react";
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
        <Link aria-label="Ingresar a mi cuenta" className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/[.08] px-2.5 py-2 text-neutral-400 transition hover:border-white/[.14] hover:text-white sm:ml-1 sm:px-3" href="/login"><LogIn aria-hidden size={16}/><span className="hidden md:inline">Ingresar</span></Link>
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

function InstagramIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>;
}

function FacebookIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>;
}

export function PublicFooter() {
  return <footer className="container-shell flex flex-col gap-4 border-t border-white/[.07] py-8 text-xs text-neutral-600">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4"><EnpassLogo/><div className="flex items-center gap-3"><a href="https://www.instagram.com/enpass.arg/" target="_blank" rel="noreferrer" aria-label="Instagram de ENPASS" className="text-neutral-500 hover:text-white"><InstagramIcon/></a><a href="https://www.facebook.com/profile.php?id=61594279708620" target="_blank" rel="noreferrer" aria-label="Facebook de ENPASS" className="text-neutral-500 hover:text-white"><FacebookIcon/></a><a href="mailto:enpass.gf@gmail.com" aria-label="Escribirnos por email" className="text-neutral-500 hover:text-white"><Mail aria-hidden size={16}/></a></div></div>
      <div className="flex flex-wrap gap-5"><Link href="/eventos" className="hover:text-white">Eventos</Link><Link href={"/mis-entradas" as never} className="hover:text-white">Mis entradas</Link><Link href="/crear-evento" className="hover:text-white">Crear eventos</Link><Link href="/login" className="hover:text-white">Ingresar</Link></div>
    </div>
    <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-white/[.05] pt-4"><Link href={"/terminos" as never} className="hover:text-white">Términos y Condiciones</Link><Link href={"/privacidad" as never} className="hover:text-white">Privacidad</Link><Link href={"/reembolsos" as never} className="hover:text-white">Reembolsos</Link><Link href={"/arrepentimiento" as never} className="hover:text-white">Botón de Arrepentimiento</Link></div>
  </footer>;
}
