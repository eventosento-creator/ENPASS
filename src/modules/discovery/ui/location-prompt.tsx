"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, X } from "lucide-react";

const LOCATION_COOKIE = "nl_loc";
const DISMISS_COOKIE = "nl_loc_no";

function readCookie(name: string) {
  return document.cookie.split("; ").find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}
function writeCookie(name: string, value: string, days: number) {
  document.cookie = `${name}=${value}; path=/; max-age=${days * 86_400}; samesite=lax`;
}

/**
 * Pide permiso de ubicación al entrar. Guarda solo un punto aproximado (~1 km) en una cookie del
 * navegador, para ordenar los eventos por cercanía. Si lo rechaza, no vuelve a preguntar por 14 días.
 */
export function LocationPrompt() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);

  function locate(refreshWhenChanged: boolean) {
    if (!("geolocation" in navigator)) return;
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const value = `${position.coords.latitude.toFixed(2)},${position.coords.longitude.toFixed(2)}`;
        const changed = readCookie(LOCATION_COOKIE) !== value;
        writeCookie(LOCATION_COOKIE, value, 30);
        setBusy(false);
        setOpen(false);
        if (changed || !refreshWhenChanged) router.refresh();
      },
      () => { setBusy(false); setDenied(true); writeCookie(DISMISS_COOKIE, "1", 14); },
      { maximumAge: 600_000, timeout: 10_000 },
    );
  }

  useEffect(() => {
    if (!("geolocation" in navigator) || readCookie(DISMISS_COOKIE)) return;
    let cancelled = false;
    async function start() {
      const state = await navigator.permissions?.query({ name: "geolocation" }).then((status) => status.state).catch(() => "prompt");
      if (cancelled) return;
      // Ya dio permiso antes: se actualiza en silencio. Si no, se muestra el aviso previo.
      if (state === "granted") locate(true);
      else if (state !== "denied" && !readCookie(LOCATION_COOKIE)) setOpen(true);
    }
    void start();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!open) return null;
  return <div role="dialog" aria-label="Eventos cerca tuyo" className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-md rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] p-4 shadow-[var(--shadow-lg)] sm:inset-x-auto sm:bottom-6 sm:left-6 sm:mx-0" style={{ marginBottom: "env(safe-area-inset-bottom)" }}>
    <button type="button" aria-label="Cerrar" className="absolute right-2 top-2 grid size-10 place-items-center text-neutral-500" onClick={() => { writeCookie(DISMISS_COOKIE, "1", 14); setOpen(false); }}><X aria-hidden size={16}/></button>
    <div className="flex items-start gap-3 pr-8">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--accent)] text-[var(--on-accent)]"><MapPin aria-hidden size={19}/></span>
      <div><p className="font-black">¿Ver los eventos cerca tuyo?</p><p className="mt-1 text-sm leading-5 text-neutral-500">Usamos tu ubicación solo para ordenar los eventos por cercanía. No la guardamos en nuestros servidores.</p>{denied && <p className="mt-2 text-sm font-semibold text-red-500">No pudimos acceder a tu ubicación. Revisá el permiso del navegador.</p>}</div>
    </div>
    <div className="mt-4 flex gap-2"><button type="button" disabled={busy} className="btn btn-primary min-h-11 flex-1" onClick={() => locate(false)}>{busy ? "Ubicando…" : "Permitir ubicación"}</button><button type="button" className="btn btn-secondary min-h-11" onClick={() => { writeCookie(DISMISS_COOKIE, "1", 14); setOpen(false); }}>Ahora no</button></div>
  </div>;
}
