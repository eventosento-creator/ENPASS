"use client";

import { useActionState, useState } from "react";
import { login, register, requestPasswordReset, sendMagicLink, signInWithGoogle } from "../application/actions";
import { SubmitButton } from "@/shared/ui/submit-button";
import { ActionMessage } from "@/shared/ui/action-message";
import { PasswordField } from "./password-field";

function GoogleIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
    <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.48a5.54 5.54 0 0 1-2.4 3.64v3.02h3.88c2.27-2.09 3.56-5.17 3.56-8.85z"/>
    <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.88-3a7.47 7.47 0 0 1-11.13-3.93H.82v3.11A12 12 0 0 0 12 24z"/>
    <path fill="#FBBC05" d="M4.94 14.18a7.2 7.2 0 0 1 0-4.36V6.71H.82a12 12 0 0 0 0 10.58z"/>
    <path fill="#EA4335" d="M12 4.75c1.76 0 3.35.6 4.6 1.79l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.34 6.71l4.12 3.2A7.18 7.18 0 0 1 12 4.75z"/>
  </svg>;
}

type AuthMode = "login" | "register" | "magic" | "recover";

export function AuthForms({ initialMode = "login", nextPath = "/app", notice, errorNotice }: { initialMode?: AuthMode; nextPath?: string; notice?: string; errorNotice?: string }) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const action = mode === "login" ? login : mode === "register" ? register : mode === "magic" ? sendMagicLink : requestPasswordReset;
  const [state, formAction] = useActionState(action, {});
  return <div className="card w-full max-w-md p-5 sm:p-8">
    <p className="eyebrow">Creá tu evento o fiesta</p><h1 className="mt-3 text-3xl font-black tracking-[-.04em]">{mode === "login" ? "Entrá a tu espacio" : mode === "register" ? "Creá tu cuenta" : mode === "magic" ? "Acceso por email" : "Recuperá tu contraseña"}</h1><p className="mt-3 text-sm leading-6 text-neutral-500">{mode === "login" ? "Administrá tus eventos, ventas y accesos." : mode === "register" ? "Empezá con tu organización y primer evento." : mode === "magic" ? "Te enviamos un enlace seguro para ingresar." : "Recibí un enlace seguro para elegir una contraseña nueva."}</p>
    {(mode === "login" || mode === "register") && <>
      <form action={signInWithGoogle.bind(null, nextPath)} className="mt-7">
        <button type="submit" className="btn-secondary flex w-full items-center justify-center gap-2"><GoogleIcon/>Continuar con Google</button>
      </form>
      <div className="my-5 flex items-center gap-3 text-xs text-neutral-400"><span className="h-px flex-1 bg-[var(--border)]"/>o<span className="h-px flex-1 bg-[var(--border)]"/></div>
    </>}
    <form action={formAction} className={(mode === "login" || mode === "register") ? "grid gap-4" : "mt-7 grid gap-4"}>
      <input type="hidden" name="next" value={nextPath}/>
      <label className="label">Email<input className="field" name="email" type="email" autoComplete="email" required /></label>
      {(mode === "login" || mode === "register") && <PasswordField label="Contraseña" name="password" autoComplete={mode === "login" ? "current-password" : "new-password"}/>}
      <ActionMessage message={notice} tone="success"/><ActionMessage message={errorNotice}/><ActionMessage message={state.error}/><ActionMessage message={state.success} tone="success"/><SubmitButton pendingLabel="Enviando…">{mode === "login" ? "Ingresar" : mode === "register" ? "Crear cuenta" : "Enviar enlace"}</SubmitButton>
    </form>
    <div className="mt-5 flex flex-wrap gap-2 text-sm text-neutral-400">
      <button type="button" className="underline" onClick={() => setMode(mode === "login" ? "register" : "login")}>{mode === "login" ? "No tengo cuenta" : "Ya tengo cuenta"}</button>
      <span>·</span><button type="button" className="underline" onClick={() => setMode("magic")}>Usar magic link</button>
      {mode === "login" && <><span>·</span><button type="button" className="underline" onClick={() => setMode("recover")}>Olvidé mi contraseña</button></>}
    </div>
  </div>;
}
