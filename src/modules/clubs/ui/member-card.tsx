"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import QRCode from "qrcode";
import { LogOut, Maximize2, RefreshCw, ShieldAlert, ShieldCheck, Smartphone, WifiOff, X } from "lucide-react";
import { logoutMember, refreshMemberQr } from "../application/member-portal-actions";
import { initialsOf, qrSecondsLeft, type MemberCardStatusKind } from "../domain/member-card";

const REFRESH_MS = 45_000;
const statusColors: Record<MemberCardStatusKind, string> = { ok: "#15803d", overdue: "#b45309", blocked: "#b91c1c", suspended: "#b91c1c" };

export type MemberCardProps = {
  slug: string; clubName: string; logoUrl: string | null;
  theme: { accent: string; onAccent: string; background: string };
  name: string; number: string; category: string; divisions: string[];
  status: { kind: MemberCardStatusKind; label: string; detail: string | null; blocked: boolean };
  initialQr: string | null;
};

// Valores que solo existen en el navegador: se leen con useSyncExternalStore (en el servidor se asume conectado y sin instalar).
const subscribeConnection = (callback: () => void) => { window.addEventListener("online", callback); window.addEventListener("offline", callback); return () => { window.removeEventListener("online", callback); window.removeEventListener("offline", callback); }; };
const noSubscribe = () => () => undefined;
const readStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const readIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Carnet digital: credencial con la marca del club, QR que se renueva solo, estado visible y modo pantalla completa para la puerta. */
export function MemberCard({ slug, clubName, logoUrl, theme, name, number, category, divisions, status, initialQr }: MemberCardProps) {
  const [payload, setPayload] = useState(initialQr);
  const [image, setImage] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(() => qrSecondsLeft(initialQr));
  const online = useSyncExternalStore(subscribeConnection, () => navigator.onLine, () => true);
  const [fullscreen, setFullscreen] = useState(false);
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const standalone = useSyncExternalStore(noSubscribe, readStandalone, () => true);
  const isIos = useSyncExternalStore(noSubscribe, readIos, () => false);
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await refreshMemberQr(slug);
      if (next) { setPayload(next); setSecondsLeft(qrSecondsLeft(next)); }
    } catch { /* sin señal: se queda con el último código hasta que venza */ }
  }, [slug]);

  // QR → imagen
  useEffect(() => {
    if (!payload) return;
    let cancelled = false;
    QRCode.toDataURL(payload, { margin: 1, width: 640, errorCorrectionLevel: "M" }).then((url) => { if (!cancelled) setImage(url); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [payload]);

  // Renovación del código, cuenta regresiva y conexión
  useEffect(() => {
    const refreshTimer = window.setInterval(() => { void refresh(); }, REFRESH_MS);
    const clock = window.setInterval(() => setSecondsLeft(qrSecondsLeft(payload)), 1000);
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    const onOnline = () => { void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      window.clearInterval(refreshTimer); window.clearInterval(clock);
      document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("online", onOnline);
    };
  }, [payload, refresh]);

  // App instalable: service worker + aviso de instalación
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register(`/mi-club/${slug}/carnet/sw.js`, { scope: `/mi-club/${slug}/carnet` }).catch(() => undefined);
    const onPrompt = (event: Event) => { event.preventDefault(); setInstallEvent(event as InstallEvent); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, [slug]);

  // Pantalla completa: la pantalla se mantiene encendida mientras se muestra el carnet
  useEffect(() => {
    if (!fullscreen) return;
    const nav = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } };
    const acquire = () => nav.wakeLock?.request("screen").then((lock) => { wakeLock.current = lock; }).catch(() => undefined);
    void acquire();
    const onVisible = () => { if (document.visibilityState === "visible") void acquire(); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setFullscreen(false); };
    document.addEventListener("visibilitychange", onVisible);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("visibilitychange", onVisible); document.removeEventListener("keydown", onKey);
      void wakeLock.current?.release().catch(() => undefined); wakeLock.current = null;
    };
  }, [fullscreen]);

  const expired = secondsLeft <= 0;
  const qrBlocked = status.blocked;
  const statusColor = statusColors[status.kind];
  const qrBlock = (large: boolean) => <div className="relative mx-auto w-full rounded-[1.25rem] bg-white p-3" style={{ maxWidth: large ? 420 : 280 }}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {image ? <img src={image} alt="Tu código QR de socio" className="aspect-square w-full" style={{ opacity: qrBlocked || expired ? 0.18 : 1 }}/> : <div className="grid aspect-square w-full place-items-center rounded-xl bg-neutral-200 p-4 text-center text-xs font-bold text-neutral-500">Cargando tu código…<br/>Si no aparece, abrí el carnet con señal.</div>}
    {(qrBlocked || expired) && image && <div className="absolute inset-0 grid place-items-center p-6 text-center text-[#0a0a0b]">
      {qrBlocked ? <p className="text-sm font-black"><ShieldAlert className="mx-auto mb-2" size={26}/>{status.kind === "suspended" ? "Membresía suspendida" : "Regularizá tus cuotas para ingresar"}</p>
        : online ? <p className="text-sm font-black"><RefreshCw className="mx-auto mb-2 animate-spin" size={24}/>Renovando el código…</p>
        : <p className="text-sm font-black"><WifiOff className="mx-auto mb-2" size={26}/>Sin señal. Reconectate para renovar el código.</p>}
    </div>}
  </div>;

  return <>
    <article aria-label={`Carnet de socio de ${clubName}`} className="mx-auto w-full max-w-sm overflow-hidden rounded-[1.75rem] shadow-2xl" style={{ background: theme.background, color: theme.onAccent }}>
      <header className="flex items-center gap-3 p-5 pb-3">
        {logoUrl /* eslint-disable-next-line @next/next/no-img-element */ ? <img src={logoUrl} alt="" className="size-12 shrink-0 rounded-xl bg-white object-contain p-1.5"/>
          : <span className="grid size-12 shrink-0 place-items-center rounded-xl text-lg font-black" style={{ background: "rgba(255,255,255,.18)" }}>{initialsOf(clubName)}</span>}
        <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[.18em] opacity-70">Carnet de socio</p><p className="truncate text-lg font-black leading-tight">{clubName}</p></div>
      </header>

      <div className="px-5 pb-4 pt-3">
        <p className="text-3xl font-black leading-[1.05] tracking-[-.03em]">{name}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold">
          <span className="rounded-full px-3 py-1" style={{ background: "rgba(255,255,255,.2)" }}>N° {number}</span>
          <span className="rounded-full px-3 py-1" style={{ background: "rgba(255,255,255,.2)" }}>{category}</span>
          {divisions.map((division) => <span key={division} className="rounded-full px-3 py-1" style={{ background: "rgba(255,255,255,.12)" }}>{division}</span>)}
        </div>
      </div>

      <div className="px-5 py-5" style={{ background: "rgba(0,0,0,.22)" }}>
        {qrBlock(false)}
        <p className="mt-3 text-center text-[11px] font-semibold opacity-80">{expired || qrBlocked ? " " : "Mostrá este código en la puerta · se renueva solo"}</p>
        <button type="button" onClick={() => setFullscreen(true)} className="mx-auto mt-3 flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-black text-[#0a0a0b]"><Maximize2 size={16}/>Pantalla completa</button>
      </div>

      <footer className="flex items-center gap-3 px-5 py-4" style={{ background: statusColor, color: "#ffffff" }}>
        {status.kind === "ok" ? <ShieldCheck size={22} className="shrink-0"/> : <ShieldAlert size={22} className="shrink-0"/>}
        <div className="min-w-0"><p className="text-base font-black uppercase tracking-wide">{status.label}</p>{status.detail && <p className="text-xs font-semibold opacity-90">{status.detail}</p>}</div>
      </footer>
    </article>

    {!online && <p role="status" className="mx-auto mt-4 flex max-w-sm items-center gap-2 rounded-xl border border-[var(--border)] px-4 py-3 text-sm font-semibold"><WifiOff size={16} className="shrink-0"/>Sin conexión: ves tu último carnet guardado. Para ingresar necesitás señal para renovar el código.</p>}

    {!standalone && <section className="mx-auto mt-4 max-w-sm rounded-xl border border-[var(--border)] p-4 text-sm" aria-label="Instalar el carnet">
      <p className="flex items-center gap-2 font-black"><Smartphone size={16}/>Tené el carnet en tu pantalla de inicio</p>
      {installEvent ? <button type="button" className="btn btn-primary mt-3 w-full" onClick={() => { void installEvent.prompt(); setInstallEvent(null); }}>Instalar carnet</button>
        : isIos ? <p className="mt-2 leading-6 text-neutral-500">En Safari tocá <b>Compartir</b> y elegí <b>Agregar a pantalla de inicio</b>.</p>
        : <p className="mt-2 leading-6 text-neutral-500">Desde el menú del navegador elegí <b>Instalar app</b> o <b>Agregar a pantalla de inicio</b>.</p>}
    </section>}

    <form action={logoutMember} onSubmit={() => { navigator.serviceWorker?.controller?.postMessage("clear"); }} className="mx-auto mt-4 max-w-sm text-center">
      <input type="hidden" name="slug" value={slug}/>
      <button type="submit" className="btn btn-ghost text-xs"><LogOut size={14}/>Cerrar sesión en este dispositivo</button>
    </form>

    {fullscreen && <div role="dialog" aria-modal="true" aria-label="Carnet en pantalla completa" className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 overflow-y-auto p-5" style={{ background: theme.background, color: theme.onAccent }}>
      <button type="button" onClick={() => setFullscreen(false)} aria-label="Cerrar pantalla completa" className="absolute right-4 top-4 grid size-12 place-items-center rounded-full" style={{ background: "rgba(0,0,0,.28)", color: "inherit" }}><X size={22}/></button>
      <div className="text-center"><p className="text-xs font-black uppercase tracking-[.18em] opacity-70">{clubName}</p><p className="mt-1 text-3xl font-black tracking-[-.03em]">{name}</p><p className="mt-1 text-sm font-bold opacity-80">N° {number} · {category}</p></div>
      {qrBlock(true)}
      <p className="rounded-full px-5 py-2 text-sm font-black uppercase tracking-wide" style={{ background: statusColor, color: "#ffffff" }}>{status.label}</p>
      <p className="text-xs font-semibold opacity-70">La pantalla se mantiene encendida mientras mostrás el carnet.</p>
    </div>}
  </>;
}
