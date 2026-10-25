"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Mantiene la pantalla de evento en vivo al día: se actualiza sola mientras esté a la vista. */
export function LiveRefresher({ renderedAt, everySeconds = 8 }: { renderedAt: string; everySeconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") router.refresh(); };
    const interval = window.setInterval(refresh, everySeconds * 1000);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", refresh); };
  }, [router, everySeconds]);
  return <span className="inline-flex items-center gap-2 text-xs font-bold text-neutral-500"><span className="size-2 animate-pulse rounded-full bg-lime-400" aria-hidden/>Actualizado {renderedAt} · se actualiza sola</span>;
}
