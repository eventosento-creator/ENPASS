import Link from "next/link";
import { ArrowUpRight, MapPin } from "lucide-react";
import type { Event, Venue } from "@/shared/database/types";
import { formatCompactEventDate } from "@/shared/lib/format";
import { EventCover } from "./event-cover";
import { EventStatusBadge } from "./event-status-badge";
import { AvailabilityIndicator } from "./availability-indicator";

export function EventCard({ event, venue, reserved = 0 }: { event: Event; venue?: Venue; reserved?: number }) {
  return <Link href={`/app/events/${event.id}`} className="group card card-interactive overflow-hidden">
    <div className="relative"><EventCover src={event.cover_image_url} alt={`Flyer de ${event.name}`} className="aspect-[4/3]" sizes="(max-width: 640px) 100vw, 45vw"/><EventStatusBadge status={event.status} className="absolute left-4 top-4"/></div>
    <div className="p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold tracking-[.08em] text-[var(--accent)]">{formatCompactEventDate(event.starts_at, venue?.timezone ?? "America/Argentina/Mendoza")}</p><h2 className="mt-2 text-xl font-black tracking-[-.02em]">{event.name}</h2>{venue && <p className="mt-1 flex items-center gap-1.5 text-sm text-neutral-500"><MapPin size={14}/>{venue.name}</p>}</div><ArrowUpRight className="mt-1 text-white/35 transition group-hover:text-white" size={20}/></div><div className="mt-5"><AvailabilityIndicator reserved={reserved} capacity={event.capacity} compact/></div></div>
  </Link>;
}
