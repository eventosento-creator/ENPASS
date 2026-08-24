import Link from "next/link";
import { MapPin } from "lucide-react";
import { EventCover } from "@/modules/events/ui/event-cover";
import { formatMoney } from "@/shared/lib/format";
import type { DiscoveryEvent } from "../domain/discovery";

export function PublicEventCard({ event, priority = false }: { event: DiscoveryEvent; priority?: boolean }) {
  const date = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", timeZone: event.timezone }).format(new Date(event.starts_at)).replace(".", "").toUpperCase();
  const price = event.has_availability ? event.from_price_amount === 0 ? "Gratis" : event.from_price_amount ? `Desde ${formatMoney(event.from_price_amount, event.currency)}` : "Ver entradas" : "Agotado";
  return <Link href={`/e/${event.slug}`} className="group block min-w-0"><EventCover src={event.cover_image_url} alt={`Flyer de ${event.name}`} className="aspect-[4/5] rounded-[1.15rem] border border-white/[.08]" priority={priority} sizes="(max-width: 640px) 48vw, (max-width: 1024px) 31vw, 24vw"/><div className="px-1 pt-4"><p className="text-[11px] font-black tracking-[.13em] text-[var(--accent)]">{date}</p><h3 className="mt-1.5 line-clamp-2 text-base font-black leading-tight tracking-[-.02em] sm:text-lg">{event.name}</h3><p className="mt-2 flex items-center gap-1 text-xs text-neutral-500 sm:text-sm"><MapPin aria-hidden size={13}/><span className="truncate">{event.venue_name} · {event.city}</span></p><p className={`mt-2 text-xs font-bold sm:text-sm ${event.has_availability ? "text-neutral-300" : "text-red-300"}`}>{price}</p></div></Link>;
}

export function PublicEventGrid({ events, priorityCount = 0 }: { events: DiscoveryEvent[]; priorityCount?: number }) {
  return <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-4 lg:gap-x-6">{events.map((event, index) => <PublicEventCard event={event} priority={index < priorityCount} key={event.id}/>)}</div>;
}
