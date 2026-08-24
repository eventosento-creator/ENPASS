"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Home, Settings } from "lucide-react";

const items = [
  { href: "/app", label: "Inicio", icon: Home },
  { href: "/app/events", label: "Eventos", icon: CalendarDays },
  { href: "/app/settings", label: "Ajustes", icon: Settings },
] as const;

export function ProducerNavigation({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  return <nav aria-label={mobile ? "Navegación móvil" : "Navegación del productor"} className={mobile ? "grid grid-cols-3 gap-1" : "grid gap-1"}>
    {items.map(({ href, label, icon: Icon }) => {
      const active = href === "/app" ? pathname === href : pathname.startsWith(href);
      return <Link aria-current={active ? "page" : undefined} href={href} key={href} className={mobile ? `grid min-h-14 place-items-center gap-1 rounded-xl text-[11px] font-bold transition ${active ? "bg-white/[.07] text-white" : "text-neutral-500"}` : `flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition ${active ? "bg-white/[.07] text-white" : "text-neutral-500 hover:bg-white/[.04] hover:text-white"}`}>
        <Icon size={mobile ? 19 : 18}/>{label}
      </Link>;
    })}
  </nav>;
}
