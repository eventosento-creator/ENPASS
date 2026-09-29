"use client";

import { useActionState, useEffect } from "react";
import { upsertMembershipCategory, type ClubActionState } from "../application/actions";
import { ActionMessage } from "@/shared/ui/action-message";
import { SubmitButton } from "@/shared/ui/submit-button";
import type { MembershipCategory } from "@/shared/database/types";

export function CategoryForm({ organizationId, category, onSaved }: { organizationId: string; category?: MembershipCategory; onSaved?: () => void }) {
  const [state, action] = useActionState<ClubActionState, FormData>(upsertMembershipCategory, {});
  useEffect(() => { if (state.success && onSaved) onSaved(); }, [state.success, onSaved]);
  return <form action={action} className="grid gap-4">
    <input type="hidden" name="organizationId" value={organizationId}/>
    {category && <input type="hidden" name="id" value={category.id}/>}
    <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
      <label className="label">Nombre<input className="field" name="name" placeholder="Socio activo" defaultValue={category?.name} required/></label>
      <label className="label">Cuota mensual<input className="field" name="monthlyFeeAmount" type="number" min="0" step="0.01" placeholder="5000" defaultValue={category ? category.monthly_fee_amount / 100 : undefined} required/></label>
    </div>
    <label className="flex items-center gap-2 text-sm font-semibold text-neutral-300"><input type="checkbox" name="active" value="true" defaultChecked={category?.active ?? true} className="size-4"/>Activa (visible al dar de alta socios)</label>
    <ActionMessage message={state.error}/><ActionMessage message={state.success} tone="success"/>
    <SubmitButton className="btn btn-primary w-fit">{category ? "Guardar cambios" : "Crear categoría"}</SubmitButton>
  </form>;
}
