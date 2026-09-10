"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarDays, LogIn, Mail, Ticket } from "lucide-react";
import { EnpassLogo } from "@/shared/ui/brand";
import { ThemeToggle } from "@/shared/ui/theme-toggle";

export function PublicHeader() {
  const pathname = usePathname();
  const isEventos = pathname === "/eventos" || pathname?.startsWith("/e/");
  const isMisEntradas = pathname?.startsWith("/mis-entradas") || pathname?.startsWith("/order/");
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return <header className={`sticky top-0 z-30 transition-[background-color,backdrop-filter,border-color,box-shadow] duration-300 ${scrolled ? "border-b border-[var(--border)] bg-[color:var(--background)]/75 shadow-[var(--shadow-xs)] backdrop-blur-xl" : "border-b border-transparent bg-[var(--background)]"}`}>
    <div className="container-shell flex h-16 items-center justify-between gap-2">
      <Link href="/" className="shrink-0"><EnpassLogo/></Link>
      <nav aria-label="Navegación principal" className="flex items-center gap-0.5 text-sm sm:gap-1">
        <NavTab active={isEventos} href="/eventos" label="Eventos" icon={CalendarDays}/>
        <NavTab active={isMisEntradas} href={"/mis-entradas" as never} label="Mis entradas" icon={Ticket} labelClassName="hidden lg:inline"/>
        <Link aria-label="Ingresar a mi cuenta" className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/[.08] px-2.5 py-2 text-neutral-400 transition hover:border-white/[.14] hover:text-white sm:ml-1 sm:px-3" href="/login"><LogIn aria-hidden size={16}/><span className="hidden md:inline">Ingresar</span></Link>
        <ThemeToggle className="rounded-full"/>
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
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>;
}

function FacebookIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>;
}

export function PublicFooter() {
  const year = new Date().getFullYear();
  return <footer className="border-t border-white/[.07]">
    <div className="container-shell grid gap-10 py-12 sm:grid-cols-[1.3fr_auto_1fr_1fr] sm:gap-8">
      <div className="max-w-sm">
        <EnpassLogo/>
        <p className="mt-4 text-[11px] font-black uppercase tracking-[.14em] text-neutral-500">Eventos · Personas · Momentos</p>
        <p className="mt-2 text-sm leading-6 text-neutral-500">Entradas, mesas y accesos para experiencias que conectan.</p>
        <div className="mt-5 flex items-center gap-4 text-neutral-500">
          <a href="https://www.instagram.com/enpass.arg/" target="_blank" rel="noreferrer" aria-label="Instagram de ENPASS" className="hover:text-white"><InstagramIcon/></a>
          <a href="https://www.facebook.com/profile.php?id=61594279708620" target="_blank" rel="noreferrer" aria-label="Facebook de ENPASS" className="hover:text-white"><FacebookIcon/></a>
          <a href="mailto:enpass.gf@gmail.com" aria-label="Escribirnos por email" className="hover:text-white"><Mail aria-hidden size={18}/></a>
        </div>
      </div>
      <div className="hidden w-px bg-white/[.07] sm:block"/>
      <FooterColumn title="Explorar" links={[
        { href: "/eventos", label: "Eventos" },
        { href: "/mis-entradas" as never, label: "Mis entradas" },
        { href: "/crear-evento", label: "Crear eventos" },
        { href: "/login", label: "Ingresar" },
      ]}/>
      <FooterColumn title="Legal" links={[
        { href: "/terminos" as never, label: "Términos y Condiciones" },
        { href: "/privacidad" as never, label: "Privacidad" },
        { href: "/reembolsos" as never, label: "Reembolsos" },
        { href: "/arrepentimiento" as never, label: "Botón de Arrepentimiento" },
      ]}/>
    </div>
    <div className="border-t border-white/[.06]">
      <div className="container-shell flex flex-col gap-2 py-5 text-xs text-neutral-600 sm:flex-row sm:items-center sm:justify-between">
        <p>© ENPASS · {year}. Todos los derechos reservados.</p>
        <a href="https://enpass.com.ar" className="inline-flex items-center gap-1 hover:text-white">enpass.com.ar ↗</a>
      </div>
    </div>
  </footer>;
}

function FooterColumn({ title, links }: { title: string; links: { href: Parameters<typeof Link>[0]["href"]; label: string }[] }) {
  return <div>
    <p className="text-sm font-bold text-[var(--text)]">{title}</p>
    <div className="mt-4 flex flex-col gap-3 text-sm text-neutral-500">{links.map((link) => <Link key={link.label} href={link.href} className="hover:text-white">{link.label}</Link>)}</div>
  </div>;
}
