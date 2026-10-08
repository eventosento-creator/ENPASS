import Link from "next/link";
import type { EventCapabilities, EventProfile } from "../domain/event-profile";
import { getPosModuleLabel } from "@/modules/pos/domain/pos";

type SectionKey = "summary" | "tickets" | "guests" | "promoters" | "tables" | "seatmap" | "access" | "pos" | "boxoffice";

// Cuatro secciones principales; las que reúnen varias pantallas muestran una segunda fila.
const groupDefs = [
  { key: "summary", label: "Resumen", children: ["summary"] },
  { key: "sales", label: "Ventas", children: ["tickets", "tables", "seatmap", "boxoffice"] },
  { key: "people", label: "Invitados", children: ["guests", "promoters"] },
  { key: "operation", label: "Operación", children: ["access", "pos"] },
] as const satisfies readonly { key: string; label: string; children: readonly SectionKey[] }[];

export function EventSectionNav({ eventId, active, capabilities, profile = "nightlife" }: { eventId: string; active: SectionKey; capabilities: EventCapabilities; profile?: EventProfile }) {
  const pages: Record<SectionKey, { href: string; label: string }> = {
    summary: { href: `/app/events/${eventId}`, label: "Resumen" },
    tickets: { href: `/app/events/${eventId}/tickets`, label: "Entradas" },
    guests: { href: `/app/events/${eventId}/guests`, label: "Lista de invitados" },
    promoters: { href: `/app/events/${eventId}/promoters`, label: "RRPP" },
    tables: { href: `/app/events/${eventId}/tables`, label: "Mesas" },
    seatmap: { href: `/app/events/${eventId}/seatmap`, label: "Asientos" },
    access: { href: `/app/events/${eventId}/access`, label: "Accesos" },
    pos: { href: `/app/events/${eventId}/pos`, label: getPosModuleLabel(profile) },
    boxoffice: { href: `/app/events/${eventId}/box-office`, label: "Taquilla" },
  };
  const isVisible = (key: SectionKey) => key === "summary" || (key === "guests" ? capabilities.tickets || capabilities.tables || capabilities.seatmap : key === "boxoffice" ? capabilities.tickets : capabilities[key]);
  // Un grupo aparece solo si tiene alguna pantalla disponible para este evento; su pestaña lleva a la primera.
  const groups = groupDefs
    .map((group) => ({ ...group, visible: group.children.filter(isVisible) }))
    .flatMap((group) => { const [first] = group.visible; return first ? [{ ...group, first }] : []; });
  const activeGroup = groups.find((group) => (group.visible as readonly SectionKey[]).includes(active));

  return <div className="mt-7">
    <nav aria-label="Secciones del evento" className="flex gap-1 overflow-x-auto border-b border-white/[.07]">
      {groups.map((group) => {
        const selected = group.key === activeGroup?.key;
        return <Link aria-current={selected ? "page" : undefined} className={`relative min-h-11 shrink-0 px-3 py-3 text-sm font-bold transition sm:px-4 ${selected ? "text-white after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-[var(--accent)]" : "text-neutral-500 hover:text-white"}`} href={pages[group.first].href as never} key={group.key}>{group.label}</Link>;
      })}
    </nav>
    {activeGroup && activeGroup.visible.length > 1 ? <nav aria-label={activeGroup.label} className="mt-3 flex gap-2 overflow-x-auto pb-1">
      {activeGroup.visible.map((key) => {
        const selected = key === active;
        return <Link aria-current={selected ? "page" : undefined} className={`inline-flex min-h-9 shrink-0 items-center rounded-full border px-3.5 text-xs font-bold transition ${selected ? "border-[var(--accent)] bg-[var(--accent)]/10 text-white" : "border-white/10 text-neutral-400 hover:text-white"}`} href={pages[key].href as never} key={key}>{pages[key].label}</Link>;
      })}
    </nav> : null}
  </div>;
}
