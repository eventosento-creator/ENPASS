"use client";

import { useActionState } from "react";
import { updatePassword } from "../application/actions";
import { ActionMessage } from "@/shared/ui/action-message";
import { SubmitButton } from "@/shared/ui/submit-button";
import { PasswordField } from "./password-field";

export function UpdatePasswordForm() {
  const [state, formAction] = useActionState(updatePassword, {});
  return <form action={formAction} className="mt-7 grid gap-4">
    <PasswordField label="Nueva contraseña" name="password" autoComplete="new-password"/>
    <PasswordField label="Repetir contraseña" name="confirmation" autoComplete="new-password"/>
    <ActionMessage message={state.error}/>
    <SubmitButton pendingLabel="Actualizando…">Guardar contraseña</SubmitButton>
  </form>;
}
