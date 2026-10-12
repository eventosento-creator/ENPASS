"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown, Loader2, Tag, X } from "lucide-react";

const storageKey = (slug: string) => `enpass-promo:${slug}`;

function readStored(slug: string) {
  try { return window.sessionStorage.getItem(storageKey(slug)) ?? ""; } catch { return ""; }
}
function writeStored(slug: string, code: string) {
  try { if (code) window.sessionStorage.setItem(storageKey(slug), code); else window.sessionStorage.removeItem(storageKey(slug)); } catch { /* sin almacenamiento: el código igual viaja en la URL */ }
}

/**
 * "¿Tenés un código de descuento?". El código vive en la URL (?code=) para que la página del servidor lo valide con la selección
 * actual; también se recuerda en la sesión para conservarlo si la persona cambia la cantidad o la categoría y vuelve al checkout.
 */
export function PromoCodeBox({ slug, appliedCode, valid, message, savingsLabel }: { slug: string; appliedCode: string | null; valid: boolean; message: string | null; savingsLabel?: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(appliedCode ?? "");
  const [syncedCode, setSyncedCode] = useState(appliedCode);
  const restored = useRef(false);
  // Cuando el servidor devuelve otro código aplicado, el campo lo refleja (se ajusta al renderizar, sin efectos).
  if (appliedCode !== syncedCode) { setSyncedCode(appliedCode); setValue(appliedCode ?? ""); }
  const isOpen = open || Boolean(appliedCode);

  function go(code: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (code) params.set("code", code); else params.delete("code");
    writeStored(slug, code);
    startTransition(() => router.replace(`${pathname}?${params.toString()}` as never, { scroll: false }));
  }

  // Si volvió al checkout sin código pero había uno aplicado, se restaura.
  useEffect(() => {
    if (restored.current || appliedCode) return;
    restored.current = true;
    const stored = readStored(slug);
    if (stored) go(stored);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className="mt-4 border-b border-white/[.07] pb-4">
    {!isOpen ? <button type="button" onClick={() => setOpen(true)} className="flex min-h-11 w-full items-center justify-between gap-2 text-left text-sm font-bold text-[var(--accent-text,var(--text))] hover:underline" aria-expanded="false">
      <span className="flex items-center gap-2"><Tag size={15}/>¿Tenés un código de descuento?</span><ChevronDown size={16}/>
    </button> : <form onSubmit={(event) => { event.preventDefault(); const code = value.trim().toUpperCase(); if (code) go(code); }} className="grid gap-2 [&>*]:min-w-0">
      <label className="text-xs font-bold uppercase tracking-wider text-neutral-600" htmlFor="promo-code">Código de descuento</label>
      <div className="flex gap-2">
        <input id="promo-code" className="field min-h-11 w-0 min-w-0 flex-1 font-mono uppercase" value={value} onChange={(event) => setValue(event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))} maxLength={30} placeholder="ELIAS20" autoComplete="off" autoCapitalize="characters" aria-describedby="promo-status"/>
        <button type="submit" className="btn btn-secondary min-h-11 shrink-0 px-4" disabled={pending || !value.trim() || value.trim().toUpperCase() === appliedCode}>{pending ? <Loader2 size={16} className="animate-spin" aria-label="Aplicando"/> : appliedCode ? "Cambiar" : "Aplicar"}</button>
      </div>
      <div id="promo-status" aria-live="polite">
        {appliedCode && valid && <div className="flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-sm status-success"><span className="flex min-w-0 items-center gap-2"><Check size={15} className="shrink-0"/><span className="truncate"><b className="font-mono">{appliedCode}</b> aplicado{savingsLabel ? ` · ahorrás ${savingsLabel}` : ""}</span></span><button type="button" onClick={() => go("")} className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-black/10" aria-label="Quitar código"><X size={15}/></button></div>}
        {appliedCode && !valid && message && <div className="flex items-start justify-between gap-2 rounded-xl px-3 py-2.5 text-sm status-danger"><span>{message}</span><button type="button" onClick={() => go("")} className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-black/10" aria-label="Quitar código"><X size={15}/></button></div>}
      </div>
    </form>}
  </div>;
}
