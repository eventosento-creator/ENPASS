"use client";

import Link from "next/link";
import { Clock3 } from "lucide-react";
import { useEffect, useState } from "react";
import { formatHoldCountdown, getRemainingHoldSeconds } from "../domain/hold";

export function HoldCountdown({ expiresAt, eventSlug, initiallyExpired = false }: { expiresAt: string; eventSlug: string; initiallyExpired?: boolean }) {
  const [remaining, setRemaining] = useState<number | null>(initiallyExpired ? 0 : null);
  useEffect(() => {
    const update = () => setRemaining(getRemainingHoldSeconds(expiresAt));
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [expiresAt]);
  const expired = remaining === 0;
  const countdown = remaining === null ? "--:--" : formatHoldCountdown(remaining);
  if (expired) return <div className="rounded-[1.1rem] border border-red-300/15 bg-red-300/[.06] p-5"><p className="font-bold text-red-200">Tu reserva venció.</p><p className="mt-1 text-sm text-neutral-500">Las entradas volvieron a estar disponibles.</p><Link href={`/e/${eventSlug}`} className="btn btn-secondary mt-4 w-full">Volver a elegir entradas</Link></div>;
  return <div className="flex items-center justify-between gap-4 rounded-[1.1rem] border border-white/[.08] bg-black/25 p-4"><div className="flex items-center gap-3"><Clock3 className="text-[var(--accent)]" size={19}/><div><p className="text-sm font-bold">Tiempo para completar la compra</p><p className="mt-0.5 text-xs text-neutral-600">La disponibilidad se libera al vencer.</p></div></div><time className="font-mono text-2xl font-black tracking-tight" dateTime={expiresAt}>{countdown}</time></div>;
}
