"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function AccessMonitor() {
  const router = useRouter();
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 4_000);
    return () => window.clearInterval(interval);
  }, [router]);
  return <span className="inline-flex items-center gap-2 text-xs font-bold text-neutral-500"><span className="size-2 animate-pulse rounded-full bg-lime-400"/>Actualiza cada 4 s</span>;
}
