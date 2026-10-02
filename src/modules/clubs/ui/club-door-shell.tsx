"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Camera, CheckCircle2, LogOut, ScanLine, ShieldCheck, WifiOff, XCircle } from "lucide-react";
import type QrScannerType from "qr-scanner";
import { getClubDoorPresentation, type ClubDoorResponse, type ClubDoorSessionView } from "../domain/club-door";

export function ClubDoorShell({ initialSession, initialUnavailable = false }: { initialSession: ClubDoorSessionView | null; initialUnavailable?: boolean }) {
  const [session, setSession] = useState(initialSession);
  if (!session && initialUnavailable) return <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center"><WifiOff size={40}/><h1 className="text-2xl font-black">No pudimos conectar</h1><p className="text-sm leading-6 text-neutral-500">Problema de conexión con el servidor. <strong>Este dispositivo sigue activado</strong>: recargá la página.</p><button className="btn btn-primary" onClick={() => window.location.reload()}>Reintentar</button></main>;
  if (!session) return <ActivationScreen onActivated={setSession}/>;
  return <ActiveDoor session={session} onEnded={() => setSession(null)}/>;
}

function ActivationScreen({ onActivated }: { onActivated: (session: ClubDoorSessionView) => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function activate(event: React.FormEvent) {
    event.preventDefault(); setError(null); setPending(true);
    try {
      const response = await fetch("/api/club-door/activate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pin }) });
      const body = await response.json() as { session?: ClubDoorSessionView; error?: string };
      if (!response.ok || !body.session) { setError(body.error ?? "No pudimos autorizar el dispositivo."); return; }
      onActivated(body.session);
    } catch { setError("Sin conexión. Revisá la red e intentá nuevamente."); }
    finally { setPending(false); }
  }
  return <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-[max(1.75rem,env(safe-area-inset-top))] sm:justify-center">
    <div className="flex items-center gap-2 text-xs font-black tracking-[.17em] text-neutral-500"><ScanLine size={17} className="text-[var(--accent)]"/> ENPASS · PUERTA DEL CLUB</div>
    <div className="my-auto py-12">
      <span className="grid size-14 place-items-center rounded-2xl border border-white/[.08] bg-white/[.04] text-[var(--accent)]"><ShieldCheck size={25}/></span>
      <p className="eyebrow mt-8">Autorizar dispositivo</p>
      <h1 className="mt-3 text-4xl font-black leading-[.95] tracking-[-.05em]">Control de ingreso de socios.</h1>
      <p className="mt-4 max-w-sm text-sm leading-6 text-neutral-500">Ingresá el PIN que generó el club en su panel. Si se cierra la sesión, el mismo PIN vuelve a abrir esta puerta.</p>
      <form className="mt-8 grid gap-4" onSubmit={activate}>
        <label className="label">PIN de 6 dígitos<input className="field h-16 text-center font-mono text-3xl font-black tracking-[.3em]" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000"/></label>
        {error && <p className="status-danger rounded-xl p-3 text-sm font-bold" role="alert">{error}</p>}
        <button className="btn btn-primary min-h-14" disabled={pin.length !== 6 || pending}>{pending ? "Autorizando…" : "Activar puerta"}</button>
      </form>
    </div>
  </div>;
}

function ActiveDoor({ session, onEnded }: { session: ClubDoorSessionView; onEnded: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScannerType | null>(null);
  const processRef = useRef<(payload: string) => Promise<void>>(async () => undefined);
  const busyRef = useRef(false);
  const lastRef = useRef<{ value: string; at: number } | null>(null);
  const timerRef = useRef<number | null>(null);
  const [result, setResult] = useState<ClubDoorResponse | null>(null);
  const [camera, setCamera] = useState<"starting" | "ready" | "denied" | "insecure" | "error">("starting");
  const [counts, setCounts] = useState({ ok: 0, denied: 0 });

  const dismiss = useCallback(async () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null; setResult(null); busyRef.current = false;
    await scannerRef.current?.start().catch(() => undefined);
  }, []);

  const show = useCallback((response: ClubDoorResponse) => {
    setResult(response);
    const presentation = getClubDoorPresentation(response);
    setCounts((current) => presentation.tone === "danger" ? { ...current, denied: current.denied + 1 } : { ...current, ok: current.ok + 1 });
    if (navigator.vibrate) navigator.vibrate(presentation.tone === "danger" ? [110, 60, 110] : 80);
    timerRef.current = window.setTimeout(() => { void dismiss(); }, presentation.durationMs);
  }, [dismiss]);

  const process = useCallback(async (payload: string) => {
    if (busyRef.current) return;
    const previous = lastRef.current;
    if (previous?.value === payload && Date.now() - previous.at < 3_000) return;
    lastRef.current = { value: payload, at: Date.now() }; busyRef.current = true;
    await scannerRef.current?.pause().catch(() => undefined);
    try {
      const response = await fetch("/api/club-door/check-in", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ payload }) });
      const body = await response.json() as { checkin?: ClubDoorResponse };
      if (!response.ok || !body.checkin) throw new Error("CHECK_IN_FAILED");
      show(body.checkin);
      if (body.checkin.result === "device_not_authorized") window.setTimeout(onEnded, 1900);
    } catch { busyRef.current = false; setCamera("error"); }
  }, [onEnded, show]);

  useEffect(() => { processRef.current = process; }, [process]);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      if (!videoRef.current) return;
      if (!window.isSecureContext) { setCamera("insecure"); return; }
      try {
        const QrScanner = (await import("qr-scanner")).default;
        if (cancelled || !videoRef.current) return;
        const scanner = new QrScanner(videoRef.current, ({ data }) => { void processRef.current(data); }, { preferredCamera: "environment", maxScansPerSecond: 12, highlightScanRegion: true, highlightCodeOutline: true, returnDetailedScanResult: true });
        scanner.setInversionMode("both"); scannerRef.current = scanner;
        await scanner.start();
        if (cancelled) return scanner.destroy();
        setCamera("ready");
      } catch (error) {
        const denied = error instanceof DOMException && ["NotAllowedError", "PermissionDeniedError"].includes(error.name);
        setCamera(denied ? "denied" : "error");
      }
    }
    void start();
    return () => { cancelled = true; scannerRef.current?.destroy(); scannerRef.current = null; if (timerRef.current) window.clearTimeout(timerRef.current); };
  }, []);

  async function logout() { await fetch("/api/club-door/logout", { method: "POST" }).catch(() => undefined); scannerRef.current?.destroy(); onEnded(); }

  const presentation = result ? getClubDoorPresentation(result) : null;
  const tone = presentation?.tone === "success" ? "bg-[#58d31f] text-[#061000]" : presentation?.tone === "warning" ? "bg-[#f3b51b] text-[#160f00]" : "bg-[#e73542] text-white";
  return <div className="relative mx-auto flex min-h-dvh w-full max-w-3xl flex-col overflow-hidden bg-[#070708]">
    <header className="z-10 flex items-center justify-between gap-3 border-b border-white/[.08] bg-black/55 px-4 pb-3 pt-[max(.75rem,env(safe-area-inset-top))] backdrop-blur">
      <div className="min-w-0"><p className="truncate text-sm font-black">{session.organization_name}</p><p className="mt-0.5 truncate text-[11px] font-bold text-neutral-500">{session.device_name} · {counts.ok} entraron · {counts.denied} rechazados</p></div>
      <button className="btn btn-ghost min-h-10" onClick={logout} aria-label="Cerrar sesión"><LogOut size={16}/></button>
    </header>
    <section className="relative flex min-h-[70dvh] flex-1 items-center justify-center overflow-hidden bg-black">
      <video ref={videoRef} className="absolute inset-0 size-full object-cover" muted playsInline/>
      {camera !== "ready" && <div className="relative z-10 max-w-xs p-7 text-center text-neutral-400"><Camera className="mx-auto" size={34}/><p className="mt-4 text-lg font-black">{camera === "starting" ? "Abriendo cámara…" : camera === "denied" ? "Permiso de cámara denegado" : camera === "insecure" ? "Hace falta una conexión segura (https)" : "No pudimos usar la cámara"}</p></div>}
      {result && presentation && <div className={`absolute inset-0 z-30 flex flex-col items-center justify-center p-7 text-center ${tone}`} role="status" aria-live="assertive" onClick={() => void dismiss()}>
        <span className="grid size-20 place-items-center rounded-full bg-black/15">{presentation.tone === "success" ? <CheckCircle2 size={46}/> : presentation.tone === "warning" ? <AlertTriangle size={45}/> : <XCircle size={46}/>}</span>
        <p className="mt-6 text-5xl font-black uppercase tracking-[-.03em]">{presentation.title}</p>
        {result.member_name && <p className="mt-4 text-3xl font-black">{result.member_name}</p>}
        {result.member_number && <p className="mt-1 text-lg font-bold opacity-80">Socio N° {result.member_number}{result.category_name ? ` · ${result.category_name}` : ""}</p>}
        <p className="mt-4 text-lg font-bold">{presentation.detail}</p>
      </div>}
    </section>
  </div>;
}
