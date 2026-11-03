"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Loader2, Mail } from "lucide-react";
import { requestBuyerCodeAction, verifyBuyerCodeAction } from "../application/actions";

const RESEND_SECONDS = 30;

/**
 * Ingreso del comprador con email + código de 6 dígitos, todo en la misma pantalla (sin abrir el mail en otra pestaña).
 * No usa <form> para poder vivir dentro del formulario de compra; Enter se maneja a mano para no enviar el formulario de afuera.
 */
export function BuyerEmailCode({ next, emailLabel = "Tu email", sendLabel = "Enviarme el código", onVerified }: { next?: string; emailLabel?: string; sendLabel?: string; onVerified: () => void }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  function sendCode() {
    const value = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) { setError("Ingresá un email válido."); return; }
    setError(null);
    startTransition(async () => {
      const result = await requestBuyerCodeAction(value, next);
      if (!result.ok) { setError(result.error ?? "No pudimos enviar el código. Probá de nuevo en un rato."); return; }
      setStep("code");
      setCode("");
      setCooldown(RESEND_SECONDS);
    });
  }

  function verify(value: string) {
    setError(null);
    startTransition(async () => {
      const result = await verifyBuyerCodeAction(email.trim(), value);
      if (!result.ok) { setError(result.error ?? "Ese código no es correcto."); setCode(""); return; }
      onVerified();
    });
  }

  function onCodeChange(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    if (digits.length === 6 && !pending) verify(digits);
  }

  const swallowEnter = (action: () => void) => (event: React.KeyboardEvent) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    action();
  };

  if (step === "email") return <div className="grid gap-4">
    <label className="label">{emailLabel}<input className="field" type="email" autoComplete="email" inputMode="email" placeholder="vos@ejemplo.com" value={email} onChange={(event) => setEmail(event.target.value)} onKeyDown={swallowEnter(sendCode)}/></label>
    {error && <p className="text-sm text-red-300" role="alert">{error}</p>}
    <button type="button" className="btn btn-primary w-full" disabled={pending} onClick={sendCode}>{pending ? <Loader2 size={18} className="animate-spin"/> : <Mail size={18}/>} {pending ? "Enviando código…" : sendLabel}</button>
  </div>;

  return <div className="grid gap-4">
    <p className="text-sm leading-6 text-neutral-400">Te mandamos un código de 6 dígitos a <strong className="text-[var(--text)]">{email.trim()}</strong>. Escribilo acá, no hace falta salir de esta página.</p>
    <label className="label">Código
      <input autoFocus className="field text-center font-mono text-2xl tracking-[.4em]" inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="······" value={code} onChange={(event) => onCodeChange(event.target.value)} onKeyDown={swallowEnter(() => code.length === 6 && verify(code))}/>
    </label>
    {error && <p className="text-sm text-red-300" role="alert">{error}</p>}
    <button type="button" className="btn btn-primary w-full" disabled={pending || code.length !== 6} onClick={() => verify(code)}>{pending ? <Loader2 size={18} className="animate-spin"/> : <Check size={18}/>} {pending ? "Verificando…" : "Verificar código"}</button>
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500">
      <button type="button" className="underline disabled:no-underline disabled:opacity-60" disabled={cooldown > 0 || pending} onClick={sendCode}>{cooldown > 0 ? `Pedir otro código en ${cooldown}s` : "Pedir otro código"}</button>
      <button type="button" className="underline" onClick={() => { setStep("email"); setError(null); }}>Cambiar email</button>
    </div>
    <p className="text-xs leading-5 text-neutral-600">Si no te llega, revisá spam. El mail también trae un botón para entrar directo.</p>
  </div>;
}
