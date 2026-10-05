"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { EventCover } from "@/modules/events/ui/event-cover";
import { formatEventDate } from "@/shared/lib/format";
import { useAutoplayCarousel } from "./use-autoplay-carousel";
import type { DiscoveryEvent } from "../domain/discovery";

/** Hero de eventos destacados: foto protagonista, un solo evento a la vez, flechas y numeración discreta. */
export function DiscoveryHeroCarousel({ events }: { events: DiscoveryEvent[] }) {
  const { trackRef, loop, activeDot, manualScroll, goToDot } = useAutoplayCarousel(events.length);
  const slides = loop ? [events[events.length - 1]!, ...events, events[0]!] : events;

  if (!events.length) return null;

  return <div className="relative overflow-hidden rounded-[1.5rem] border border-[var(--border)] bg-black sm:rounded-[1.75rem]">
    <div ref={trackRef} className="hero-carousel-track relative flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain scroll-smooth" style={{ touchAction: "pan-y" }}>
      {slides.map((event, index) => <Link
        href={`/e/${event.slug}`}
        data-slide
        key={`${event.id}-${index}`}
        className="group relative block h-[26rem] w-full shrink-0 snap-center overflow-hidden sm:h-[28.5rem] lg:h-[31rem]"
      >
        <EventCover src={event.cover_image_url} alt={`Flyer de ${event.name}`} className="absolute inset-0" priority={index === (loop ? 1 : 0)} sizes="(max-width: 1440px) 100vw, 1440px" fit="cover"/>
        <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/35 to-black/5"/>
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/20"/>
        <div className="absolute inset-0 flex flex-col justify-end p-6 pb-16 sm:justify-center sm:p-12 sm:pb-12 lg:px-16">
          <p className="flex items-center gap-4 text-[11px] font-bold uppercase tracking-[.22em] !text-white/70">Destacado<span aria-hidden className="h-px w-24 bg-white/30"/></p>
          <h2 className="mt-3 line-clamp-2 max-w-2xl text-4xl font-black leading-[1.02] tracking-[-.035em] !text-white sm:text-6xl">{event.name}</h2>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-semibold !text-white/85 sm:text-base">
            <span className="flex items-center gap-2"><CalendarDays aria-hidden size={16}/>{formatEventDate(event.starts_at, event.timezone)}</span>
            <span className="flex items-center gap-2"><MapPin aria-hidden size={16}/>{event.venue_name} · {event.city}</span>
          </div>
          <span className="mt-6 inline-flex min-h-12 w-fit items-center gap-2 rounded-full bg-white pl-6 pr-5 text-sm font-bold text-black transition group-hover:gap-3 group-hover:brightness-105">{event.has_availability ? "Ver entradas" : "Ver evento"}<ArrowRight aria-hidden size={16}/></span>
        </div>
      </Link>)}
    </div>
    {events.length > 1 && <>
      <div className="absolute inset-x-6 bottom-6 flex items-center justify-between sm:inset-x-12 sm:bottom-8 lg:inset-x-16">
        <div className="flex items-center gap-4 text-xs font-bold !text-white" role="tablist" aria-label="Eventos destacados">
          {events.map((event, dotIndex) => <button key={event.id} type="button" role="tab" aria-selected={activeDot === dotIndex} aria-label={`Ir al evento ${dotIndex + 1}`} onClick={() => goToDot(dotIndex)} className={`relative pb-1.5 transition ${activeDot === dotIndex ? "opacity-100" : "opacity-50 hover:opacity-80"}`}>
            {String(dotIndex + 1).padStart(2, "0")}
            <span aria-hidden className={`absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-white transition-all ${activeDot === dotIndex ? "opacity-100" : "opacity-0"}`}/>
          </button>)}
        </div>
        <div className="flex gap-2">
          <button type="button" aria-label="Ver evento anterior" onClick={() => manualScroll(-1)} className="grid size-11 place-items-center rounded-full border border-white/20 bg-black/35 !text-white backdrop-blur transition hover:bg-black/60"><ChevronLeft size={18}/></button>
          <button type="button" aria-label="Ver siguiente evento" onClick={() => manualScroll(1)} className="grid size-11 place-items-center rounded-full border border-white/20 bg-black/35 !text-white backdrop-blur transition hover:bg-black/60"><ChevronRight size={18}/></button>
        </div>
      </div>
    </>}
  </div>;
}
