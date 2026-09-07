import Link from "next/link";
import { CalendarDays, LogIn, Ticket } from "lucide-react";
import { EnpassLogo } from "@/shared/ui/brand";
import { ThemeToggle } from "@/shared/ui/theme-toggle";

export function PublicHeader() {
  return <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[color:var(--background)]/90 backdrop-blur-xl">
    <div className="container-shell flex h-16 items-center justify-between gap-2">
      <Link href="/" className="shrink-0"><EnpassLogo/></Link>
      <nav aria-label="Navegación principal" className="flex items-center gap-0.5 text-sm sm:gap-1">
        <Link aria-label="Explorar eventos" className="inline-flex min-h-10 items-center gap-2 rounded-full px-2.5 py-2 text-neutral-300 transition hover:bg-white/[.05] hover:text-white sm:px-3" href="/eventos"><CalendarDays aria-hidden size={16}/><span className="hidden sm:inline">Eventos</span></Link>
        <Link aria-label="Mis entradas" className="inline-flex min-h-10 items-center gap-2 rounded-full px-2.5 py-2 text-neutral-400 transition hover:bg-white/[.05] hover:text-white sm:px-3" href={"/mis-entradas" as never}><Ticket aria-hidden size={16}/><span className="hidden lg:inline">Mis entradas</span></Link>
        <ThemeToggle className="rounded-full"/><Link aria-label="Ingresar para crear eventos" className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/[.08] px-2.5 py-2 text-neutral-400 transition hover:border-white/[.14] hover:text-white sm:ml-1 sm:px-3" href="/login"><LogIn aria-hidden size={16}/><span className="hidden md:inline">Crear evento</span></Link>
      </nav>
    </div>
  </header>;
}

export function PublicFooter() {
  return <footer className="container-shell flex flex-col gap-3 border-t border-white/[.07] py-8 text-xs text-neutral-600 sm:flex-row sm:items-center sm:justify-between">
    <EnpassLogo/>
    <div className="flex flex-wrap gap-5"><Link href="/eventos" className="hover:text-white">Eventos</Link><Link href={"/mis-entradas" as never} className="hover:text-white">Mis entradas</Link><Link href="/crear-evento" className="hover:text-white">Crear eventos</Link><Link href="/login" className="hover:text-white">Ingresar</Link></div>
  </footer>;
}
