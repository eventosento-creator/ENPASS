import Link from "next/link";
import type { EventCapabilities, EventProfile } from "../domain/event-profile";
import { getPosModuleLabel } from "@/modules/pos/domain/pos";

export function EventSectionNav({ eventId, active, capabilities, profile = "nightlife" }: { eventId: string; active: "summary" | "tickets" | "promoters" | "tables" | "access" | "pos"; capabilities: EventCapabilities; profile?: EventProfile }) {
  const items = [
    { href: `/app/events/${eventId}`, label: "Resumen", key: "summary" },
    { href: `/app/events/${eventId}#entradas`, label: "Entradas", key: "tickets" },
    { href: `/app/events/${eventId}/promoters`, label: "RRPP", key: "promoters" },
    { href: `/app/events/${eventId}/tables`, label: "Mesas", key: "tables" },
    { href: `/app/events/${eventId}/access`, label: "Accesos", key: "access" },
    { href: `/app/events/${eventId}/pos`, label: getPosModuleLabel(profile), key: "pos" },
  ] as const;
  const visibleItems = items.filter((item) => item.key === "summary" || capabilities[item.key]);
  return <nav aria-label="Secciones del evento" className="mt-7 flex gap-1 overflow-x-auto border-b border-white/[.07]">
    {visibleItems.map(item => <Link aria-current={active === item.key ? "page" : undefined} className={`relative min-h-11 shrink-0 px-3 py-3 text-sm font-bold transition sm:px-4 ${active === item.key ? "text-white after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-[var(--accent)]" : "text-neutral-500 hover:text-white"}`} href={item.href} key={item.key}>{item.label}</Link>)}
  </nav>;
}
