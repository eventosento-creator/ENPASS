import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import { EventCover } from "@/modules/events/ui/event-cover";
import { formatMoney } from "@/shared/lib/format";
import { FavoriteButton } from "./favorite-button";
import type { DiscoveryEvent } from "../domain/discovery";

/** Card editorial: foto grande con la fecha encima, corazón de favoritos, título, lugar y CTA. */
export function PublicEventCard({ event, priority = false, favorited = false }: { event: DiscoveryEvent; priority?: boolean; favorited?: boolean }) {
  const parts = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", timeZone: event.timezone }).formatToParts(new Date(event.starts_at));
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  const month = (parts.find((part) => part.type === "month")?.value ?? "").replace(".", "").toUpperCase();
  const price = event.has_availability ? event.from_price_amount === 0 ? "Gratis" : event.from_price_amount ? `Desde ${formatMoney(event.from_price_amount, event.currency)}` : null : "Agotado";
  return <div className="group relative flex min-w-0 flex-col overflow-hidden rounded-[1.15rem] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-xs)] transition duration-300 hover:-translate-y-1 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-md)]">
    <Link href={`/e/${event.slug}`} className="flex flex-1 flex-col">
      <div className="relative">
        <EventCover src={event.cover_image_url} alt={`Flyer de ${event.name}`} className="aspect-[4/3]" priority={priority} sizes="(max-width: 640px) 70vw, (max-width: 1024px) 31vw, 20vw"/>
        <span className="absolute left-3 top-3 grid min-w-12 place-items-center rounded-xl bg-black/55 px-2.5 py-1.5 text-center leading-none !text-white backdrop-blur"><span className="text-[10px] font-bold tracking-[.12em] !text-white/80">{month}</span><span className="mt-1 text-xl font-black !text-white">{day}</span></span>
      </div>
      <div className="flex-1 p-4 pb-3">
        <h3 className="line-clamp-2 text-base font-black leading-tight tracking-[-.02em] sm:text-[17px]">{event.name}</h3>
        <p className="mt-2 truncate text-xs text-[var(--muted)] sm:text-[13px]">{event.venue_name}</p>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-[var(--muted)] sm:text-[13px]"><MapPin aria-hidden size={12} className="shrink-0"/><span className="truncate">{event.city}</span></p>
        {price && <p className={`mt-2 text-xs font-bold ${event.has_availability ? "text-[var(--text-secondary)]" : "text-red-400"}`}>{price}</p>}
      </div>
    </Link>
    <div className="px-4 pb-4"><Link href={`/e/${event.slug}`} tabIndex={-1} aria-hidden className="flex min-h-10 items-center justify-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--surface-raised)] text-[13px] font-bold transition group-hover:border-[var(--accent)] group-hover:bg-[var(--accent)] group-hover:text-[var(--on-accent)]">Ver entradas<ArrowRight size={14}/></Link></div>
    <FavoriteButton eventId={event.id} initiallyFavorited={favorited} className="right-3 top-3"/>
  </div>;
}
