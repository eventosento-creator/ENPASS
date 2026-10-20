"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy } from "lucide-react";

/** Dato para copiar (alias, CBU, monto) con un toque. */
export function CopyField({ label, value, display, mono = true, strong = false }: { label: string; value: string; display?: string; mono?: boolean; strong?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { /* Sin portapapeles: el dato igual se ve en pantalla. */ }
  }
  return <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] px-4 py-3">
    <div className="min-w-0"><p className="text-[11px] font-bold uppercase tracking-[.08em] text-neutral-500">{label}</p><p className={`mt-0.5 break-all ${mono ? "font-mono" : ""} ${strong ? "text-lg font-black" : "text-sm font-bold"}`}>{display ?? value}</p></div>
    <button type="button" onClick={copy} aria-label={`Copiar ${label}`} className="grid size-11 shrink-0 place-items-center rounded-xl border border-[var(--border-strong)]">{copied ? <Check size={17}/> : <Copy size={17}/>}</button>
  </div>;
}

/** Mientras ENPASS revisa el comprobante, la página se actualiza sola para mostrar las entradas apenas se aprueba. */
export function TransferRefresher({ everySeconds = 20 }: { everySeconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, everySeconds * 1000);
    return () => window.clearInterval(interval);
  }, [router, everySeconds]);
  return null;
}
