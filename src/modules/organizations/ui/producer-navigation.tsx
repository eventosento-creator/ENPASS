"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CalendarDays, Home, Settings, UserRoundCheck, Users } from "lucide-react";

const baseItems = [
  { href: "/app", label: "Inicio", icon: Home },
  { href: "/app/events", label: "Mis eventos", icon: CalendarDays },
] as const;
const clubItem = { href: "/app/socios", label: "Club", icon: UserRoundCheck } as const;
const trailingItems = [
  { href: "/app/clientes", label: "Clientes", icon: Users },
  { href: "/app/reportes", label: "Reportes", icon: BarChart3 },
  { href: "/app/settings", label: "Ajustes", icon: Settings },
] as const;

const mobileGridCols: Record<number, string> = { 4: "grid-cols-4", 5: "grid-cols-5", 6: "grid-cols-6" };

export function ProducerNavigation({ mobile = false, collaboratorOnly = false, clubEnabled = false }: { mobile?: boolean; collaboratorOnly?: boolean; clubEnabled?: boolean }) {
  const pathname = usePathname();
  if (collaboratorOnly) return null;
  const items = [...baseItems, ...(clubEnabled ? [clubItem] : []), ...trailingItems];
  return <nav aria-label={mobile ? "Navegación móvil" : "Navegación del productor"} className={mobile ? `grid ${mobileGridCols[items.length] ?? "grid-cols-4"} gap-1` : "grid gap-1"}>
    {items.map(({ href, label, icon: Icon }) => {
      const active = href === "/app" ? pathname === href : pathname.startsWith(href);
      return <Link aria-current={active ? "page" : undefined} href={href as never} key={href} className={mobile ? `grid min-h-14 place-items-center gap-1 rounded-xl text-[11px] font-bold transition ${active ? "bg-white/[.07] text-white" : "text-neutral-500"}` : `flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition ${active ? "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow-xs)]" : "text-neutral-500 hover:bg-white/[.04] hover:text-white"}`}>
        <Icon size={mobile ? 19 : 18}/>{label}
      </Link>;
    })}
  </nav>;
}
