"use client";

import { useActionState, useState } from "react";
import { login, register, requestPasswordReset, sendMagicLink } from "../application/actions";
import { SubmitButton } from "@/shared/ui/submit-button";
import { ActionMessage } from "@/shared/ui/action-message";
import { PasswordField } from "./password-field";

type AuthMode = "login" | "register" | "magic" | "recover";

export function AuthForms({ initialMode = "login", nextPath = "/app", notice, errorNotice }: { initialMode?: AuthMode; nextPath?: string; notice?: string; errorNotice?: string }) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const action = mode === "login" ? login : mode === "register" ? register : mode === "magic" ? sendMagicLink : requestPasswordReset;
  const [state, formAction] = useActionState(action, {});
  return <div className="card w-full max-w-md p-5 sm:p-8">
    <p className="eyebrow">Creá tu evento o fiesta</p><h1 className="mt-3 text-3xl font-black tracking-[-.04em]">{mode === "login" ? "Entrá a tu espacio" : mode === "register" ? "Creá tu cuenta" : mode === "magic" ? "Acceso por email" : "Recuperá tu contraseña"}</h1><p className="mt-3 text-sm leading-6 text-neutral-500">{mode === "login" ? "Administrá tus eventos, ventas y accesos." : mode === "register" ? "Empezá con tu organización y primer evento." : mode === "magic" ? "Te enviamos un enlace seguro para ingresar." : "Recibí un enlace seguro para elegir una contraseña nueva."}</p>
    <form action={formAction} className="mt-7 grid gap-4">
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
