"use client";

import { useActionState } from "react";
import { renameOrganization } from "../application/actions";
import type { ActionState } from "@/modules/identity/application/actions";
import { ActionMessage } from "@/shared/ui/action-message";
import { SubmitButton } from "@/shared/ui/submit-button";

export function RenameOrganizationForm({ organizationId, name }: { organizationId: string; name: string }) {
  const [state, action] = useActionState<ActionState, FormData>(renameOrganization, {});
  return <form action={action} className="grid gap-3 sm:max-w-md">
    <input type="hidden" name="organizationId" value={organizationId}/>
    <label className="label">Nombre del espacio<input className="field" name="name" defaultValue={name} minLength={2} maxLength={100} required/></label>
    <p className="text-xs text-neutral-500">Es el nombre que ves arriba en el menú. El link público de tu club no cambia, así que los que ya compartiste siguen funcionando.</p>
    <ActionMessage message={state.error}/><ActionMessage message={state.success} tone="success"/>
    <SubmitButton className="btn btn-primary w-fit" pendingLabel="Guardando…">Guardar nombre</SubmitButton>
  </form>;
}
