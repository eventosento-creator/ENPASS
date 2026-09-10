import { useEffect, useRef, useState } from "react";

const AUTOPLAY_INTERVAL_MS = 4000;
const RESUME_AFTER_INTERACTION_MS = 4000;

/**
 * Drives an infinite-loop, autoplaying horizontal scroll track (via [data-slide] children),
 * pausing on hover/touch/manual navigation and resuming after a few idle seconds.
 * The caller is expected to render `itemCount + 2` slides when looping: a clone of the last
 * item first, the real items, then a clone of the first item last.
 */
export function useAutoplayCarousel(itemCount: number) {
  const trackRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef(1);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pausedRef = useRef(false);
  const [activeDot, setActiveDot] = useState(0);

  const loop = itemCount > 1;

  useEffect(() => {
    const track = trackRef.current;
    if (!track || itemCount < 2) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const slideCount = loop ? itemCount + 2 : itemCount;

    function slideAt(index: number) {
      return track!.querySelectorAll<HTMLElement>("[data-slide]")[index] ?? null;
    }

    function realIndex(index: number) {
      if (!loop) return index;
      return (index - 1 + itemCount) % itemCount;
    }

    function goTo(index: number, behavior: ScrollBehavior) {
      const slide = slideAt(index);
      if (!slide || !track) return;
      track.scrollTo({ left: slide.offsetLeft, behavior });
      indexRef.current = index;
    }

    goTo(1, "instant");

    function handleScrollSettle() {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      settleTimerRef.current = setTimeout(() => {
        if (!track) return;
        if (loop && indexRef.current === slideCount - 1) goTo(1, "instant");
        else if (loop && indexRef.current === 0) goTo(slideCount - 2, "instant");
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
  }, [itemCount]);

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

  return { trackRef, loop, activeDot, manualScroll, goToDot };
}
