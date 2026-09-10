"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { EventCover } from "@/modules/events/ui/event-cover";
import { formatEventDate, formatMoney } from "@/shared/lib/format";
import type { DiscoveryEvent } from "../domain/discovery";

const AUTOPLAY_INTERVAL_MS = 4000;
const RESUME_AFTER_INTERACTION_MS = 4000;

export function DiscoveryHeroCarousel({ events }: { events: DiscoveryEvent[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef(1);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pausedRef = useRef(false);
  const [activeDot, setActiveDot] = useState(0);

  const loop = events.length > 1;
  const slides = loop ? [events[events.length - 1]!, ...events, events[0]!] : events;

  useEffect(() => {
    const track = trackRef.current;
    if (!track || slides.length < 2) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function slideAt(index: number) {
      return track!.querySelectorAll<HTMLElement>("[data-slide]")[index] ?? null;
    }

    function realIndex(index: number) {
      if (!loop) return index;
      return (index - 1 + events.length) % events.length;
    }

    function goTo(index: number, behavior: ScrollBehavior) {
      const slide = slideAt(index);
      if (!slide || !track) return;
      track.scrollTo({ left: slide.offsetLeft, behavior });
      indexRef.current = index;
    }

    // Start centered on the first real slide, no animation.
    goTo(1, "instant");

    function handleScrollSettle() {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      settleTimerRef.current = setTimeout(() => {
        if (!track) return;
        if (loop && indexRef.current === slides.length - 1) goTo(1, "instant");
        else if (loop && indexRef.current === 0) goTo(slides.length - 2, "instant");
        setActiveDot(realIndex(indexRef.current));
      }, 220);
    }

    function scheduleResume() {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = setTimeout(() => { pausedRef.current = false; }, RESUME_AFTER_INTERACTION_MS);
    }

    function handleUserInteraction() {
      pausedRef.current = true;
      scheduleResume();
    }

    track.addEventListener("scroll", handleScrollSettle, { passive: true });
    track.addEventListener("touchstart", handleUserInteraction, { passive: true });
    track.addEventListener("pointerdown", handleUserInteraction, { passive: true });
    track.addEventListener("mouseenter", () => { pausedRef.current = true; });
    track.addEventListener("mouseleave", () => { pausedRef.current = false; });

    let autoplayInterval: ReturnType<typeof setInterval> | null = null;
    if (!reducedMotion) {
      autoplayInterval = setInterval(() => {
        if (pausedRef.current) return;
        goTo(indexRef.current + 1, "smooth");
      }, AUTOPLAY_INTERVAL_MS);
    }

    return () => {
      if (autoplayInterval) clearInterval(autoplayInterval);
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      track.removeEventListener("scroll", handleScrollSettle);
      track.removeEventListener("touchstart", handleUserInteraction);
      track.removeEventListener("pointerdown", handleUserInteraction);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events.length]);

  if (!events.length) return null;

  function manualScroll(direction: 1 | -1) {
    const track = trackRef.current;
    if (!track) return;
    pausedRef.current = true;
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => { pausedRef.current = false; }, RESUME_AFTER_INTERACTION_MS);
    const slideEls = track.querySelectorAll<HTMLElement>("[data-slide]");
    const nextIndex = indexRef.current + direction;
    const target = slideEls[nextIndex];
    if (!target) return;
    track.scrollTo({ left: target.offsetLeft, behavior: "smooth" });
    indexRef.current = nextIndex;
  }

  function goToDot(dotIndex: number) {
    const track = trackRef.current;
    if (!track) return;
    pausedRef.current = true;
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => { pausedRef.current = false; }, RESUME_AFTER_INTERACTION_MS);
    const target = track.querySelectorAll<HTMLElement>("[data-slide]")[loop ? dotIndex + 1 : dotIndex];
    if (!target) return;
    track.scrollTo({ left: target.offsetLeft, behavior: "smooth" });
    indexRef.current = loop ? dotIndex + 1 : dotIndex;
    setActiveDot(dotIndex);
  }

  return <div className="relative">
    <div ref={trackRef} className="hero-carousel-track flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain scroll-smooth px-4 pb-1 sm:px-[max(1.5rem,calc((100vw-1120px)/2))]" style={{ touchAction: "pan-y" }}>
      {slides.map((event, index) => {
        const price = event.has_availability ? (event.from_price_amount === 0 ? "Gratis" : event.from_price_amount ? `Desde ${formatMoney(event.from_price_amount, event.currency)}` : "Ver entradas") : "Agotado";
        return <Link
          href={`/e/${event.slug}`}
          data-slide
          key={`${event.id}-${index}`}
          className="group relative aspect-[4/3] w-[90%] shrink-0 snap-center overflow-hidden rounded-[1.5rem] border border-white/[.08] shadow-[var(--shadow-lg)] sm:aspect-[16/6.5] sm:w-[86%] lg:w-[80%]"
        >
          <EventCover
            src={event.cover_image_url}
            alt={`Flyer de ${event.name}`}
            className="absolute inset-0"
            priority={index === (loop ? 1 : 0)}
            sizes="(max-width: 640px) 90vw, (max-width: 1024px) 86vw, 80vw"
            fit="contain"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent"/>
          <span className="absolute left-5 top-5 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[.1em] text-black shadow-lg">
            ✦ Próxima fecha
            <span aria-hidden className={`size-1.5 rounded-full ${event.has_availability ? "bg-emerald-500" : "bg-red-500"}`}/>
          </span>
          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8">
            <h2 className="line-clamp-2 max-w-lg text-2xl font-black leading-[1.08] tracking-[-.03em] text-white sm:text-4xl">{event.name}</h2>
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
    {events.length > 1 && <>
      <button type="button" aria-label="Ver evento anterior" onClick={() => manualScroll(-1)} className="absolute left-3 top-1/2 z-10 hidden size-11 -translate-y-1/2 place-items-center rounded-full border border-white/10 bg-black/30 text-white backdrop-blur transition hover:bg-black/50 sm:grid lg:left-6"><ChevronLeft size={18}/></button>
      <button type="button" aria-label="Ver siguiente evento" onClick={() => manualScroll(1)} className="absolute right-3 top-1/2 z-10 hidden size-11 -translate-y-1/2 place-items-center rounded-full border border-white/10 bg-black/30 text-white backdrop-blur transition hover:bg-black/50 sm:grid lg:right-6"><ChevronRight size={18}/></button>
      <div className="mt-4 flex items-center justify-center gap-2">{events.map((event, dotIndex) => <button
        key={event.id}
        type="button"
        aria-label={`Ir al evento ${dotIndex + 1}`}
        aria-current={activeDot === dotIndex}
        onClick={() => goToDot(dotIndex)}
        className={`h-1.5 rounded-full transition-all ${activeDot === dotIndex ? "w-6 bg-[var(--accent)]" : "w-1.5 bg-[var(--border-strong)] hover:bg-[var(--muted)]"}`}
      />)}</div>
    </>}
  </div>;
}
