"use client";

import { useRef } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { EventCover } from "@/modules/events/ui/event-cover";
import { formatEventDate, formatMoney } from "@/shared/lib/format";
import type { DiscoveryEvent } from "../domain/discovery";

export function DiscoveryHeroCarousel({ events }: { events: DiscoveryEvent[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  if (!events.length) return null;

  function scrollBy(direction: 1 | -1) {
    const track = trackRef.current;
    if (!track) return;
    const slide = track.querySelector<HTMLElement>("[data-slide]");
    const step = (slide?.offsetWidth ?? track.clientWidth * 0.86) + 16;
    track.scrollBy({ left: step * direction, behavior: "smooth" });
  }

  return <div className="relative -mx-4 sm:mx-0">
    <div ref={trackRef} className="hero-carousel-track flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-4 pb-1 sm:rounded-[1.75rem] sm:px-0">
      {events.map((event, index) => {
        const price = event.has_availability ? (event.from_price_amount === 0 ? "Gratis" : event.from_price_amount ? `Desde ${formatMoney(event.from_price_amount, event.currency)}` : "Ver entradas") : "Agotado";
        return <Link
          href={`/e/${event.slug}`}
          data-slide
          key={event.id}
          className="group relative aspect-[4/3] w-[86%] shrink-0 snap-center overflow-hidden rounded-[1.5rem] border border-white/[.08] shadow-[var(--shadow-lg)] sm:aspect-[16/9] sm:w-[70%] lg:w-[58%]"
        >
          <EventCover
            src={event.cover_image_url}
            alt={`Flyer de ${event.name}`}
            className="absolute inset-0"
            priority={index === 0}
            sizes="(max-width: 640px) 86vw, (max-width: 1024px) 70vw, 58vw"
            fit="contain"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent"/>
          <span className="absolute left-5 top-5 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[.1em] text-black shadow-lg">
            ✦ Próxima fecha
            <span aria-hidden className={`size-1.5 rounded-full ${event.has_availability ? "bg-emerald-500" : "bg-red-500"}`}/>
          </span>
          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
            <h2 className="line-clamp-2 max-w-lg text-2xl font-black leading-[1.08] tracking-[-.03em] text-white sm:text-3xl">{event.name}</h2>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-semibold text-white/80 sm:text-sm">
              <span className="flex items-center gap-1.5"><CalendarDays size={14}/>{formatEventDate(event.starts_at, event.timezone)}</span>
              <span className="flex items-center gap-1.5"><MapPin size={14}/>{event.venue_name} · {event.city}</span>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <span className="inline-flex min-h-11 items-center gap-1.5 rounded-[.85rem] bg-white pl-5 pr-4 text-sm font-bold text-black shadow-[var(--highlight-top),0_1px_2px_rgb(0_0_0/24%)] transition group-hover:gap-2.5 group-hover:brightness-105">Ver entradas<ArrowRight size={16}/></span>
              <span className="text-sm font-bold text-white/90">{price}</span>
            </div>
          </div>
        </Link>;
      })}
    </div>
    {events.length > 1 && <div className="mt-4 hidden items-center justify-end gap-2 sm:flex">
      <button type="button" aria-label="Anterior" onClick={() => scrollBy(-1)} className="grid size-11 place-items-center rounded-full border border-white/10 bg-white/[.04] backdrop-blur transition hover:border-[var(--accent)]/40 hover:bg-white/[.08]"><ChevronLeft size={18}/></button>
      <button type="button" aria-label="Siguiente" onClick={() => scrollBy(1)} className="grid size-11 place-items-center rounded-full border border-white/10 bg-white/[.04] backdrop-blur transition hover:border-[var(--accent)]/40 hover:bg-white/[.08]"><ChevronRight size={18}/></button>
    </div>}
  </div>;
}
