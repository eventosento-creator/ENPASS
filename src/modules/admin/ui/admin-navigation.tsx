"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Banknote, Building2, CalendarDays, LayoutDashboard, RefreshCw, Users2, Wallet } from "lucide-react";

type Item = { href: string; label: string; icon: typeof LayoutDashboard; badge?: number };

export function AdminNavigation({ transfersPending = 0, mobile = false }: { transfersPending?: number; mobile?: boolean }) {
  const pathname = usePathname();
  const main: Item[] = [
    { href: "/admin", label: "Resumen", icon: LayoutDashboard },
    { href: "/admin/eventos", label: "Eventos", icon: CalendarDays },
    { href: "/admin/clubes", label: "Clubes", icon: Users2 },
    { href: "/admin/productores", label: "Productores", icon: Building2 },
  ];
  const money: Item[] = [
    { href: "/admin/transferencias", label: "Transferencias", icon: Banknote, badge: transfersPending },
    { href: "/admin/liquidaciones", label: "Liquidaciones", icon: Wallet },
    { href: "/admin/pagos", label: "Reprocesar pago", icon: RefreshCw },
  ];
  const active = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));
  const render = (items: Item[]) => items.map(({ href, label, icon: Icon, badge }) => <Link key={href} href={href as never} aria-current={active(href) ? "page" : undefined}
    className={`flex min-h-10 items-center gap-2.5 whitespace-nowrap rounded-xl px-3 text-sm font-bold transition ${active(href) ? "bg-[var(--surface-strong)] text-[var(--text)]" : "text-neutral-500 hover:bg-[var(--surface-strong)]"}`}>
    <Icon size={17} aria-hidden/>{label}{badge ? <span className="ml-auto rounded-full bg-amber-400/90 px-2 text-[11px] font-black text-black">{badge}</span> : null}
  </Link>);
  if (mobile) return <nav aria-label="Administración" className="flex gap-1 overflow-x-auto px-3 py-2">{render([...main, ...money])}</nav>;
  return <nav aria-label="Administración" className="grid gap-1">
    {render(main)}
    <p className="mt-4 px-3 text-[10px] font-bold uppercase tracking-[.14em] text-neutral-600">Plata</p>
    {render(money)}
  </nav>;
}
