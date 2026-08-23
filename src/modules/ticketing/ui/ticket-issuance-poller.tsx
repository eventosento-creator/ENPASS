"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function TicketIssuancePoller() {
  const router = useRouter();
  useEffect(() => {
    let attempts = 0;
    const interval = window.setInterval(() => {
      attempts += 1;
      router.refresh();
      if (attempts >= 10) window.clearInterval(interval);
    }, 3000);
    return () => window.clearInterval(interval);
  }, [router]);
  return <p className="mt-4 text-xs text-neutral-600" role="status">Actualizando el estado de emisión…</p>;
}
