"use client";

import { useActionState } from "react";
import { setMemberPassword, type MemberPortalState } from "../application/member-portal-actions";
import { PasswordField } from "@/modules/identity/ui/password-field";
import { ActionMessage } from "@/shared/ui/action-message";
import { SubmitButton } from "@/shared/ui/submit-button";

export function MemberSetPasswordForm({ slug, token }: { slug: string; token: string }) {
  const [state, action] = useActionState<MemberPortalState, FormData>(setMemberPassword, {});
  return <form action={action} className="mt-6 grid gap-4">
    <input type="hidden" name="slug" value={slug}/><input type="hidden" name="token" value={token}/>
    <PasswordField label="Contraseña nueva (mínimo 8 caracteres)" name="password" autoComplete="new-password"/>
    <PasswordField label="Repetí la contraseña" name="confirm" autoComplete="new-password"/>
    <ActionMessage message={state.error}/>
    <SubmitButton pendingLabel="Guardando…">Guardar y entrar</SubmitButton>
  </form>;
}
