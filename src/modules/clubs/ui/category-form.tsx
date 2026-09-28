"use client";

import { useActionState } from "react";
import { upsertMembershipCategory, type ClubActionState } from "../application/actions";
import { ActionMessage } from "@/shared/ui/action-message";
import { SubmitButton } from "@/shared/ui/submit-button";

export function CategoryForm({ organizationId }: { organizationId: string }) {
  const [state, action] = useActionState<ClubActionState, FormData>(upsertMembershipCategory, {});
  return <form action={action} className="card grid gap-4 p-5">
    <input type="hidden" name="organizationId" value={organizationId}/>
    <p className="text-sm font-bold">Nueva categoría de membresía</p>
    <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
      <label className="label">Nombre<input className="field" name="name" placeholder="Socio activo" required/></label>
      <label className="label">Cuota mensual<input className="field" name="monthlyFeeAmount" type="number" min="0" step="0.01" placeholder="5000" required/></label>
    </div>
    <ActionMessage message={state.error}/><ActionMessage message={state.success} tone="success"/>
    <SubmitButton className="btn btn-secondary">Guardar categoría</SubmitButton>
  </form>;
}
