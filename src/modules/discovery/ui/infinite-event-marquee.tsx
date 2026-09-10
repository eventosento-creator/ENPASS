import { PublicEventCard } from "./public-event-card";
import type { DiscoveryEvent } from "../domain/discovery";

export function InfiniteEventMarquee({ events, favoritedIds = [] }: { events: DiscoveryEvent[]; favoritedIds?: string[] }) {
  if (!events.length) return null;
  const favoritedSet = new Set(favoritedIds);
  const loopEvents = events.length > 1 ? [...events, ...events] : events;
  const durationSeconds = Math.max(events.length * 6, 18);

  return <div className="group/marquee overflow-hidden">
    <div
      className="flex w-max gap-4 px-4 will-change-transform [animation:marquee_var(--marquee-duration)_linear_infinite] sm:gap-6 sm:px-[max(1.5rem,calc((100vw-1120px)/2))] group-hover/marquee:[animation-play-state:paused]"
      style={{ "--marquee-duration": `${durationSeconds}s` } as React.CSSProperties}
    >
      {loopEvents.map((event, index) => {
        const isDuplicate = index >= events.length;
        return <div key={`${event.id}-${index}`} className={`w-[46vw] shrink-0 sm:w-[26vw] lg:w-[18vw] ${isDuplicate ? "pointer-events-none" : ""}`} aria-hidden={isDuplicate}>
          <PublicEventCard event={event} favorited={favoritedSet.has(event.id)}/>
        </div>;
      })}
    </div>
  </div>;
}
