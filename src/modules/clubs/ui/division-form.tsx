"use client";

import { useActionState, useEffect } from "react";
import { upsertDivision } from "../application/actions";
import { ActionMessage } from "@/shared/ui/action-message";
import { SubmitButton } from "@/shared/ui/submit-button";
import type { DivisionRow } from "../domain/club";

export function DivisionForm({ organizationId, division, categories, onSaved }: { organizationId: string; division?: DivisionRow; categories: Array<{ id: string; name: string }>; onSaved?: () => void }) {
  const [state, action] = useActionState(upsertDivision, {});
  useEffect(() => { if (state.success && onSaved) onSaved(); }, [state.success, onSaved]);
  return <form action={action} className="grid gap-4">
    <input type="hidden" name="organizationId" value={organizationId}/>
    {division && <input type="hidden" name="id" value={division.divisionId}/>}
    <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
      <label className="label">Nombre<input className="field" name="name" placeholder="Fútbol" defaultValue={division?.name} required/></label>
      <label className="label">Cuota mensual<input className="field" name="monthlyFeeAmount" type="number" min="0" step="0.01" placeholder="3000" defaultValue={division ? division.monthlyFeeAmount / 100 : undefined} required/></label>
    </div>
    <label className="label">Categoría <span className="font-normal text-neutral-500">(opcional)</span><select className="field" name="categoryId" defaultValue={division?.categoryId ?? ""}>
      <option value="">Sin categoría</option>
      {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
    </select><span className="text-xs font-normal text-neutral-500">Ej.: categoría Futsal → divisiones C13, C17, 1ra. En la web, cada categoría muestra sus divisiones.</span></label>
    <label className="flex items-center gap-2 text-sm font-semibold text-neutral-300"><input type="checkbox" name="active" value="true" defaultChecked={division?.active ?? true} className="size-4"/>Activa (disponible para anotar socios)</label>
    <ActionMessage message={state.error}/><ActionMessage message={state.success} tone="success"/>
    <SubmitButton className="btn btn-primary w-fit">{division ? "Guardar cambios" : "Crear división"}</SubmitButton>
  </form>;
}
