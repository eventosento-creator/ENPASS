"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Camera, CheckCircle2, Flashlight, Keyboard, LogOut, RotateCcw, ScanLine, Settings2, ShieldCheck, Vibrate, Volume2, VolumeX, Wifi, WifiOff, X, XCircle } from "lucide-react";
import type QrScannerType from "qr-scanner";
import { canUseSupervisorTools, getResultPresentation, isNightlifeQrPayload, type CheckInResponse, type ScannerSessionView } from "../domain/scanner";

type ManualPreview = {
  found: boolean;
  short_code?: string;
  holder_name?: string;
  ticket_type_name?: string;
  sector?: string | null;
  status?: string;
  used_entries?: number;
  max_entries?: number;
};

export function ScannerShell({ initialSession, developmentMode }: { initialSession: ScannerSessionView | null; developmentMode: boolean }) {
  const [session, setSession] = useState(initialSession);
  if (!session) return <ActivationScreen onActivated={setSession}/>;
  return <ActiveScanner session={session} developmentMode={developmentMode} onSessionEnded={() => setSession(null)}/>;
}

function ActivationScreen({ onActivated }: { onActivated: (session: ScannerSessionView) => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function activate(event: React.FormEvent) {
    event.preventDefault(); setError(null); setPending(true);
    try {
      const response = await fetch("/api/scanner/activate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pin }) });
      const body = await response.json() as { session?: ScannerSessionView; error?: string };
      if (!response.ok || !body.session) { setError(body.error ?? "No pudimos autorizar el dispositivo."); return; }
      onActivated(body.session);
    } catch { setError("Sin conexión. Revisá la red e intentá nuevamente."); }
    finally { setPending(false); }
  }
  return <div className="safe-bottom mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-[max(1.75rem,env(safe-area-inset-top))] sm:justify-center">
    <div className="flex items-center gap-2 text-xs font-black tracking-[.17em] text-neutral-500"><ScanLine size={17} className="text-[var(--accent)]"/> NIGHTLIFE ACCESS</div>
    <div className="my-auto py-12"><span className="grid size-14 place-items-center rounded-2xl border border-white/[.08] bg-white/[.04] text-[var(--accent)]"><ShieldCheck size={25}/></span><p className="eyebrow mt-8">Autorizar dispositivo</p><h1 className="mt-3 text-4xl font-black leading-[.95] tracking-[-.05em]">Prepará esta puerta.</h1><p className="mt-4 max-w-sm text-sm leading-6 text-neutral-500">Ingresá el PIN temporal generado por el productor. Este dispositivo no necesita una cuenta del dashboard.</p>
      <form className="mt-8 grid gap-4" onSubmit={activate}><label className="label">PIN de 6 dígitos<input className="field h-16 text-center font-mono text-3xl font-black tracking-[.3em]" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" aria-describedby={error ? "pin-error" : undefined} autoFocus/></label>{error && <p id="pin-error" className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm font-semibold text-red-200">{error}</p>}<button className="btn btn-primary h-14 w-full" disabled={pending || pin.length !== 6}>{pending ? "Autorizando…" : "Activar scanner"}</button></form>
    </div><p className="text-center text-[11px] text-neutral-700">Sesión separada · sin acceso al dashboard</p>
  </div>;
}

function ActiveScanner({ session, developmentMode, onSessionEnded }: { session: ScannerSessionView; developmentMode: boolean; onSessionEnded: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScannerType | null>(null);
  const processPayloadRef = useRef<(payload: string) => Promise<void>>(async () => undefined);
  const busyRef = useRef(false);
  const lastPayloadRef = useRef<{ value: string; at: number } | null>(null);
  const dismissTimerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const [result, setResult] = useState<CheckInResponse | null>(null);
  const [online, setOnline] = useState(true);
  const [cameraState, setCameraState] = useState<"starting" | "ready" | "denied" | "insecure" | "error">("starting");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [haptics, setHaptics] = useState(true);
  const [sound, setSound] = useState(true);
  const [flashAvailable, setFlashAvailable] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [devPayload, setDevPayload] = useState("");
  const [acceptedCount, setAcceptedCount] = useState(0);

  const dismissResult = useCallback(async () => {
    if (dismissTimerRef.current) window.clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = null; setResult(null); busyRef.current = false;
    if (navigator.onLine) await scannerRef.current?.start().catch(() => {
      setCameraState(videoRef.current?.srcObject ? "ready" : "error");
    });
  }, []);

  const showResult = useCallback((checkin: CheckInResponse) => {
    setResult(checkin);
    if (checkin.result === "valid") setAcceptedCount((count) => count + 1);
    const presentation = getResultPresentation(checkin);
    if (haptics && navigator.vibrate) navigator.vibrate(presentation.tone === "success" ? 80 : [110, 60, 110]);
    if (sound) {
      try {
        const context = audioContextRef.current ?? new AudioContext();
        audioContextRef.current = context;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = presentation.tone === "success" ? 880 : 220;
        gain.gain.setValueAtTime(0.0001, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.13);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(); oscillator.stop(context.currentTime + 0.14);
        void context.resume();
      } catch { /* Feedback is best-effort on browsers that block Web Audio. */ }
    }
    const canOverride = canUseSupervisorTools(session.permission) && ["wrong_gate", "too_early", "too_late"].includes(checkin.result);
    if (!canOverride) dismissTimerRef.current = window.setTimeout(() => { void dismissResult(); }, presentation.durationMs);
  }, [dismissResult, haptics, session.permission, sound]);

  const processPayload = useCallback(async (payload: string) => {
    if (busyRef.current || !online) return;
    const previous = lastPayloadRef.current;
    if (previous?.value === payload && Date.now() - previous.at < 3_000) return;
    lastPayloadRef.current = { value: payload, at: Date.now() }; busyRef.current = true;
    await scannerRef.current?.pause().catch(() => undefined);
    if (!isNightlifeQrPayload(payload)) {
      showResult({ result: "invalid", checkin_id: null, ticket_id: null, holder_name: null, ticket_type_name: null, sector: null, short_code: null, used_entries: null, max_entries: null, first_used_at: null, first_used_gate_name: null, valid_from: null, valid_until: null, suggested_gate_name: null, scanned_at: new Date().toISOString() });
      return;
    }
    try {
      const response = await fetch("/api/scanner/check-in", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ payload, idempotencyKey: crypto.randomUUID() }) });
      const body = await response.json() as { checkin?: CheckInResponse };
      if (!response.ok || !body.checkin) throw new Error("CHECK_IN_FAILED");
      showResult(body.checkin);
      if (body.checkin.result === "device_not_authorized") window.setTimeout(onSessionEnded, 1900);
    } catch {
      busyRef.current = false; setCameraState("error");
    }
  }, [online, onSessionEnded, showResult]);

  useEffect(() => { processPayloadRef.current = processPayload; }, [processPayload]);

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    updateOnline();
    window.addEventListener("online", updateOnline); window.addEventListener("offline", updateOnline);
    return () => { window.removeEventListener("online", updateOnline); window.removeEventListener("offline", updateOnline); };
  }, []);

  useEffect(() => {
    if (!online) void scannerRef.current?.pause();
    else if (!busyRef.current) void scannerRef.current?.start().catch(() => {
      setCameraState(videoRef.current?.srcObject ? "ready" : "error");
    });
  }, [online]);

  useEffect(() => {
    let cancelled = false;
    async function startCamera() {
      if (!videoRef.current) return;
      if (!window.isSecureContext) { setCameraState("insecure"); return; }
      try {
        const QrScanner = (await import("qr-scanner")).default;
        if (cancelled || !videoRef.current) return;
        const scanner = new QrScanner(videoRef.current, ({ data }) => { void processPayloadRef.current(data); }, { preferredCamera: "environment", maxScansPerSecond: 12, highlightScanRegion: true, highlightCodeOutline: true, returnDetailedScanResult: true });
        scanner.setInversionMode("both"); scannerRef.current = scanner;
        await scanner.start();
        if (cancelled) return scanner.destroy();
        setCameraState("ready"); setFlashAvailable(await scanner.hasFlash().catch(() => false));
      } catch (error) {
        if (videoRef.current?.srcObject) { setCameraState("ready"); return; }
        const denied = error instanceof DOMException && ["NotAllowedError", "PermissionDeniedError"].includes(error.name);
        setCameraState(denied ? "denied" : "error");
      }
    }
    void startCamera();
    return () => { cancelled = true; scannerRef.current?.destroy(); scannerRef.current = null; void audioContextRef.current?.close(); if (dismissTimerRef.current) window.clearTimeout(dismissTimerRef.current); };
  }, []);

  async function toggleFlash() { if (!scannerRef.current) return; try { await scannerRef.current.toggleFlash(); setFlashOn(scannerRef.current.isFlashOn()); } catch { setFlashAvailable(false); } }
  async function endSession() { await fetch("/api/scanner/logout", { method: "POST" }).catch(() => undefined); scannerRef.current?.destroy(); onSessionEnded(); }
  async function override() {
    if (!result?.checkin_id) return;
    const reason = result.result === "wrong_gate" ? "wrong_gate" : "outside_window";
    try {
      const response = await fetch("/api/scanner/override", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ checkinId: result.checkin_id, reason, idempotencyKey: crypto.randomUUID() }) });
      const body = await response.json() as { checkin?: CheckInResponse };
      if (!response.ok || !body.checkin) return;
      showResult(body.checkin);
    } catch { /* The current rejection remains visible for a deliberate retry. */ }
  }

  return <div className="relative mx-auto flex min-h-dvh w-full max-w-3xl flex-col overflow-hidden bg-[#070708]">
    <header className="z-10 flex items-center justify-between gap-3 border-b border-white/[.08] bg-black/55 px-4 pb-3 pt-[max(.75rem,env(safe-area-inset-top))] backdrop-blur"><div className="min-w-0"><p className="truncate text-sm font-black">{session.event_name}</p><p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] font-bold text-neutral-500"><span className={`size-1.5 shrink-0 rounded-full ${online ? "bg-[var(--success)]" : "bg-[var(--danger)]"}`}/>{session.gate_name} · {session.permission === "supervisor" ? "Supervisor" : "Scanner"} · {online ? "Online" : "Sin red"}</p></div><div className="flex shrink-0 items-center gap-2"><div className="text-right"><p className="text-sm font-black tabular-nums">{acceptedCount}</p><p className="text-[9px] font-bold uppercase tracking-wider text-neutral-600">Esta sesión</p></div><span className={`hidden items-center gap-1.5 text-[11px] font-bold sm:flex ${online ? "text-lime-300" : "text-red-300"}`}>{online ? <Wifi size={14}/> : <WifiOff size={14}/>}{online ? "Online" : "Sin red"}</span><button className="grid size-11 place-items-center rounded-xl border border-white/[.08] bg-white/[.04]" onClick={() => setSettingsOpen((value) => !value)} aria-label="Configuración"><Settings2 size={18}/></button></div></header>

    <section className="relative flex min-h-[62dvh] flex-1 items-center justify-center overflow-hidden bg-black"><video ref={videoRef} className="absolute inset-0 size-full object-cover" muted playsInline/><div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_20%,rgb(0_0_0/.36)_78%)]"/>{cameraState === "starting" && <CameraMessage icon={<Camera/>} title="Iniciando cámara" detail="Preparando el lector…"/>}{cameraState === "denied" && <CameraMessage icon={<Camera/>} title="Habilitá la cámara" detail="Permití el acceso a la cámara desde la configuración del navegador y volvé a intentar." action={<button className="btn btn-secondary mt-5" onClick={() => window.location.reload()}>Reintentar</button>}/>} {cameraState === "insecure" && <CameraMessage icon={<ShieldCheck/>} title="Abrí una conexión segura" detail="Usá localhost o una URL HTTPS para habilitar la cámara."/>} {cameraState === "error" && <CameraMessage icon={<AlertTriangle/>} title="Cámara no disponible" detail="Revisá el permiso o probá con otra cámara." action={<button className="btn btn-secondary mt-5" onClick={() => window.location.reload()}><RotateCcw size={16}/>Reintentar</button>}/>} {!online && <div className="absolute inset-0 z-20 grid place-items-center bg-[#160b0d]/95 p-8 text-center"><div><WifiOff className="mx-auto text-red-300" size={38}/><h2 className="mt-5 text-3xl font-black">SIN CONEXIÓN</h2><p className="mx-auto mt-3 max-w-xs text-sm leading-6 text-red-100/60">Reconectando. La validación está detenida y no se permiten ingresos offline.</p></div></div>}
      {result && (
        <ResultOverlay response={result} timezone={session.event_timezone} supervisor={session.permission === "supervisor"} onOverride={override} onDismiss={dismissResult}/>
      )}
    </section>

    <footer className="z-10 grid grid-cols-3 items-center border-t border-white/[.08] bg-[#0b0b0d] px-3 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-3"><button className="grid min-h-12 place-items-center text-[10px] font-bold text-neutral-500" onClick={() => setManualOpen(true)} disabled={!canUseSupervisorTools(session.permission)}><Keyboard size={20}/><span className="mt-1">Código</span></button><div className="grid place-items-center"><span className={`grid size-14 place-items-center rounded-full border-4 ${cameraState === "ready" && online ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-neutral-700 text-neutral-600"}`}><ScanLine size={24}/></span></div><button className="grid min-h-12 place-items-center text-[10px] font-bold text-neutral-500" onClick={() => void toggleFlash()} disabled={!flashAvailable}><Flashlight size={20} className={flashOn ? "text-[var(--accent)]" : ""}/><span className="mt-1">Linterna</span></button></footer>

    {settingsOpen && <div className="absolute inset-x-3 top-16 z-40 rounded-2xl border border-white/[.1] bg-[#17171a]/95 p-4 shadow-2xl backdrop-blur"><div className="flex items-center justify-between"><p className="font-black">Preferencias</p><button onClick={() => setSettingsOpen(false)} aria-label="Cerrar"><X size={18}/></button></div><button className="mt-4 flex w-full items-center justify-between rounded-xl border border-white/[.07] p-3 text-sm" onClick={() => setHaptics((value) => !value)}><span className="flex items-center gap-2"><Vibrate size={17}/>Vibración</span><span className={haptics ? "text-lime-300" : "text-neutral-600"}>{haptics ? "Activa" : "Inactiva"}</span></button><button className="mt-2 flex w-full items-center justify-between rounded-xl border border-white/[.07] p-3 text-sm" onClick={() => setSound((value) => !value)}><span className="flex items-center gap-2">{sound ? <Volume2 size={17}/> : <VolumeX size={17}/>}Sonido</span><span className={sound ? "text-lime-300" : "text-neutral-600"}>{sound ? "Activo" : "Inactivo"}</span></button><button className="mt-2 flex w-full items-center gap-2 rounded-xl border border-red-400/15 p-3 text-sm font-bold text-red-300" onClick={() => void endSession()}><LogOut size={17}/>Cerrar sesión del scanner</button>{developmentMode && <form className="mt-4 border-t border-white/[.07] pt-4" onSubmit={(event) => { event.preventDefault(); setSettingsOpen(false); void processPayload(devPayload); }}><label className="label">Entrada QR de desarrollo<input className="field" value={devPayload} onChange={(event) => setDevPayload(event.target.value)} placeholder="NLOS1:…"/></label><button className="btn btn-secondary mt-3 w-full" disabled={!devPayload}>Probar payload</button></form>}</div>}
    {manualOpen && (
      <ManualLookup onClose={() => setManualOpen(false)} onResult={(checkin) => { setManualOpen(false); busyRef.current = true; void scannerRef.current?.pause(); showResult(checkin); }}/>
    )}
  </div>;
}

function formatAccessTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("es-AR", { timeZone: timezone, hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));
}

function ResultOverlay({ response, timezone, supervisor, onOverride, onDismiss }: { response: CheckInResponse; timezone: string; supervisor: boolean; onOverride: () => void; onDismiss: () => void }) {
  const presentation = getResultPresentation(response);
  const tone = presentation.tone === "success" ? "bg-[#58d31f] text-[#061000]" : presentation.tone === "warning" ? "bg-[#f3b51b] text-[#160f00]" : "bg-[#e73542] text-white";
  const overrideAvailable = supervisor && ["wrong_gate", "too_early", "too_late"].includes(response.result);
  return <div className={`absolute inset-0 z-30 flex flex-col items-center justify-center p-7 text-center ${tone}`} role="status" aria-live="assertive"><span className="grid size-20 place-items-center rounded-full bg-black/15">{presentation.tone === "success" ? <CheckCircle2 size={46}/> : presentation.tone === "warning" ? <AlertTriangle size={45}/> : <XCircle size={46}/>}</span><p className="mt-6 text-4xl font-black leading-none tracking-[-.05em] sm:text-5xl">{presentation.title}</p><p className="mt-3 text-base font-bold opacity-75">{presentation.detail}</p>{response.result === "too_early" && response.valid_from && <p className="mt-2 text-sm font-black">Válida desde {formatAccessTime(response.valid_from, timezone)}</p>}{response.result === "too_late" && response.valid_until && <p className="mt-2 text-sm font-black">Válida hasta {formatAccessTime(response.valid_until, timezone)}</p>}{response.holder_name && <div className="mt-7 rounded-2xl bg-black/12 px-6 py-4"><p className="text-xl font-black">{response.holder_name}</p><p className="mt-1 text-sm font-bold opacity-70">{response.ticket_type_name}{response.sector ? ` · ${response.sector}` : ""}</p>{response.result === "valid" && <p className="mt-2 text-xs font-black uppercase">{formatAccessTime(response.scanned_at, timezone)}</p>}{response.max_entries && response.max_entries > 1 && <p className="mt-2 text-xs font-black uppercase">Ingreso {response.used_entries} de {response.max_entries}</p>}{response.first_used_at && response.result === "already_used" && <p className="mt-2 text-xs font-bold opacity-70">Primer ingreso: {formatAccessTime(response.first_used_at, timezone)}{response.first_used_gate_name ? ` · ${response.first_used_gate_name}` : ""}</p>}</div>}{overrideAvailable && <div className="mt-8 grid w-full max-w-xs gap-2"><button className="btn bg-black text-white" onClick={onOverride}><ShieldCheck size={17}/>Autorizar excepción</button><button className="btn border border-black/20 bg-transparent" onClick={onDismiss}>No autorizar</button></div>}</div>;
}

function CameraMessage({ icon, title, detail, action }: { icon: React.ReactNode; title: string; detail: string; action?: React.ReactNode }) { return <div className="relative z-10 max-w-xs p-7 text-center"><span className="mx-auto block w-fit text-neutral-600 [&>svg]:size-9">{icon}</span><p className="mt-5 text-xl font-black">{title}</p><p className="mt-2 text-sm leading-6 text-neutral-500">{detail}</p>{action}</div>; }

function ManualLookup({ onClose, onResult }: { onClose: () => void; onResult: (result: CheckInResponse) => void }) {
  const [shortCode, setShortCode] = useState(""); const [preview, setPreview] = useState<ManualPreview | null>(null); const [error, setError] = useState<string | null>(null); const [pending, setPending] = useState(false);
  async function search(event: React.FormEvent) { event.preventDefault(); setPending(true); setError(null); try { const response = await fetch("/api/scanner/manual/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ shortCode }) }); const body = await response.json() as { ticket?: ManualPreview; error?: string }; if (!response.ok || !body.ticket) { setError(body.error ?? "No encontramos la entrada."); return; } setPreview(body.ticket); if (!body.ticket.found) setError("No encontramos una entrada para ese código."); } catch { setError("Sin conexión."); } finally { setPending(false); } }
  async function confirm() { setPending(true); try { const response = await fetch("/api/scanner/manual/check-in", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ shortCode, idempotencyKey: crypto.randomUUID() }) }); const body = await response.json() as { checkin?: CheckInResponse; error?: string }; if (!response.ok || !body.checkin) { setError(body.error ?? "No pudimos validar."); return; } onResult(body.checkin); } catch { setError("Sin conexión."); } finally { setPending(false); } }
  return <div className="absolute inset-0 z-50 flex items-end bg-black/75 p-3 backdrop-blur sm:items-center sm:justify-center"><div className="w-full max-w-md rounded-3xl border border-white/[.1] bg-[#151518] p-5 shadow-2xl"><div className="flex items-center justify-between"><div><p className="eyebrow">Supervisor</p><h2 className="mt-2 text-xl font-black">Buscar por código</h2></div><button className="grid size-10 place-items-center rounded-xl bg-white/[.05]" onClick={onClose} aria-label="Cerrar"><X size={18}/></button></div><form onSubmit={search} className="mt-6"><label className="label">Código corto<input className="field font-mono text-lg uppercase tracking-wider" value={shortCode} onChange={(event) => { setShortCode(event.target.value.toUpperCase()); setPreview(null); }} placeholder="NABC-12" autoFocus/></label><button className="btn btn-secondary mt-3 w-full" disabled={pending}>{pending ? "Buscando…" : "Buscar entrada"}</button></form>{error && <p className="mt-4 text-sm font-semibold text-red-300">{error}</p>}{preview?.found && <div className="mt-5 rounded-2xl border border-white/[.08] bg-black/20 p-4"><p className="text-lg font-black">{preview.holder_name}</p><p className="mt-1 text-sm text-neutral-400">{preview.ticket_type_name}{preview.sector ? ` · ${preview.sector}` : ""}</p><p className="mt-3 text-xs font-bold uppercase text-neutral-600">Estado {preview.status} · {preview.used_entries}/{preview.max_entries} ingresos</p><button className="btn btn-primary mt-5 w-full" onClick={() => void confirm()} disabled={pending}>Confirmar ingreso manual</button></div>}</div></div>;
}
