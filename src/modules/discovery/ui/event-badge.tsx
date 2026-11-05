import { cn } from "@/shared/lib/cn";
import type { EventBadge } from "../domain/discovery";

const badges: Record<EventBadge, { label: string; className: string }> = {
  sold_out: { label: "Sold out", className: "bg-red-600" },
  last_tickets: { label: "Últimas entradas", className: "bg-amber-500" },
};

/** Cucarda que va sobre el flyer; el contenedor la posiciona. */
export function EventBadgePill({ badge, className }: { badge: EventBadge; className?: string }) {
  const { label, className: color } = badges[badge];
  return <span className={cn("inline-flex items-center rounded-full px-3 py-1.5 text-[11px] font-black uppercase leading-none tracking-[.1em] !text-white shadow-lg", color, className)}>{label}</span>;
}
