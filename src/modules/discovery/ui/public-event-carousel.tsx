"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAutoplayCarousel } from "./use-autoplay-carousel";
import { PublicEventCard } from "./public-event-card";
import type { DiscoveryEvent } from "../domain/discovery";

export function PublicEventCarousel({ events, priorityCount = 0, favoritedIds = [] }: { events: DiscoveryEvent[]; priorityCount?: number; favoritedIds?: string[] }) {
  const { trackRef, loop, manualScroll } = useAutoplayCarousel(events.length);
  const slides = loop ? [events[events.length - 1]!, ...events, events[0]!] : events;
  const favoritedSet = new Set(favoritedIds);

  if (!events.length) return null;

  return <div className="relative -mx-4 sm:mx-0">
    <div ref={trackRef} className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain scroll-smooth px-4 pb-1 sm:gap-5 sm:px-0" style={{ touchAction: "pan-y" }}>
      {slides.map((event, index) => <div data-slide key={`${event.id}-${index}`} className="w-[46%] shrink-0 snap-start sm:w-[31%] lg:w-[23%]">
        <PublicEventCard event={event} priority={index < priorityCount} favorited={favoritedSet.has(event.id)}/>
      </div>)}
    </div>
    {events.length > 4 && <div className="mt-5 hidden items-center justify-end gap-2 sm:flex">
      <button type="button" aria-label="Ver eventos anteriores" onClick={() => manualScroll(-1)} className="grid size-10 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface)] transition hover:border-[var(--border-strong)]"><ChevronLeft size={17}/></button>
      <button type="button" aria-label="Ver más eventos" onClick={() => manualScroll(1)} className="grid size-10 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface)] transition hover:border-[var(--border-strong)]"><ChevronRight size={17}/></button>
    </div>}
  </div>;
}
