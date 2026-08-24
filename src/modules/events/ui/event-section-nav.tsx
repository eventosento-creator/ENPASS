import Link from "next/link";

export function EventSectionNav({ eventId, active }: { eventId: string; active: "summary" | "tickets" | "access" }) {
  const items = [
    { href: `/app/events/${eventId}`, label: "Resumen", key: "summary" },
    { href: `/app/events/${eventId}#entradas`, label: "Entradas", key: "tickets" },
    { href: `/app/events/${eventId}/access`, label: "Accesos", key: "access" },
  ] as const;
  return <nav aria-label="Secciones del evento" className="mt-7 flex gap-1 overflow-x-auto border-b border-white/[.07]">
    {items.map(item => <Link aria-current={active === item.key ? "page" : undefined} className={`relative min-h-11 shrink-0 px-4 py-3 text-sm font-bold transition ${active === item.key ? "text-white after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-[var(--accent)]" : "text-neutral-500 hover:text-white"}`} href={item.href} key={item.key}>{item.label}</Link>)}
  </nav>;
}
