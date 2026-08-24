"use client";

import { useActionState } from "react";
import { updatePassword } from "../application/actions";
import { ActionMessage } from "@/shared/ui/action-message";
import { SubmitButton } from "@/shared/ui/submit-button";

export function UpdatePasswordForm() {
  const [state, formAction] = useActionState(updatePassword, {});
  return <form action={formAction} className="mt-7 grid gap-4">
    <label className="label">Nueva contraseña<input className="field" name="password" type="password" minLength={8} autoComplete="new-password" required /></label>
    <label className="label">Repetir contraseña<input className="field" name="confirmation" type="password" minLength={8} autoComplete="new-password" required /></label>
    <ActionMessage message={state.error}/>
    <SubmitButton pendingLabel="Actualizando…">Guardar contraseña</SubmitButton>
  </form>;
}
