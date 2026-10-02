"use client";

import { useActionState, useState } from "react";
import { loginMember, requestMemberPassword, type MemberPortalState } from "../application/member-portal-actions";
import { PasswordField } from "@/modules/identity/ui/password-field";
import { ActionMessage } from "@/shared/ui/action-message";
import { SubmitButton } from "@/shared/ui/submit-button";

export function MemberLoginForm({ slug }: { slug: string }) {
  const [mode, setMode] = useState<"login" | "recover">("login");
  const [loginState, loginAction] = useActionState<MemberPortalState, FormData>(loginMember, {});
  const [recoverState, recoverAction] = useActionState<MemberPortalState, FormData>(requestMemberPassword, {});
  const state = mode === "login" ? loginState : recoverState;
  return <form action={mode === "login" ? loginAction : recoverAction} className="mt-6 grid gap-4">
    <input type="hidden" name="slug" value={slug}/>
    <label className="label">DNI o mail<input className="field" name="identifier" autoComplete="username" required/></label>
    {mode === "login" && <PasswordField label="Contraseña" name="password" autoComplete="current-password"/>}
    <ActionMessage message={state.error}/><ActionMessage message={state.success} tone="success"/>
    <SubmitButton pendingLabel="Enviando…">{mode === "login" ? "Ingresar" : "Mandarme el link"}</SubmitButton>
    <button type="button" className="text-left text-sm text-neutral-400 underline" onClick={() => setMode(mode === "login" ? "recover" : "login")}>
      {mode === "login" ? "Crear o recuperar contraseña" : "Ya tengo contraseña"}
    </button>
  </form>;
}
