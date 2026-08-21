"use client";

import { useActionState, useState } from "react";
import { login, register, sendMagicLink } from "../application/actions";
import { SubmitButton } from "@/shared/ui/submit-button";
import { ActionMessage } from "@/shared/ui/action-message";

type AuthMode = "login" | "register" | "magic";

export function AuthForms({ initialMode = "login", nextPath = "/app" }: { initialMode?: AuthMode; nextPath?: string }) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const action = mode === "login" ? login : mode === "register" ? register : sendMagicLink;
  const [state, formAction] = useActionState(action, {});
  return <div className="card w-full max-w-md p-5 sm:p-8">
    <p className="eyebrow">Producer</p><h1 className="mt-3 text-3xl font-black">{mode === "login" ? "Volvé a la noche" : mode === "register" ? "Creá tu cuenta" : "Acceso por email"}</h1>
    <form action={formAction} className="mt-7 grid gap-4">
      <input type="hidden" name="next" value={nextPath}/>
      <label className="label">Email<input className="field" name="email" type="email" autoComplete="email" required /></label>
      {mode !== "magic" && <label className="label">Contraseña<input className="field" name="password" type="password" minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} required /></label>}
      <ActionMessage message={state.error}/><SubmitButton>{mode === "login" ? "Ingresar" : mode === "register" ? "Crear cuenta" : "Enviar enlace"}</SubmitButton>
    </form>
    <div className="mt-5 flex flex-wrap gap-2 text-sm text-neutral-400">
      <button type="button" className="underline" onClick={() => setMode(mode === "login" ? "register" : "login")}>{mode === "login" ? "No tengo cuenta" : "Ya tengo cuenta"}</button>
      <span>·</span><button type="button" className="underline" onClick={() => setMode("magic")}>Usar magic link</button>
    </div>
  </div>;
}
