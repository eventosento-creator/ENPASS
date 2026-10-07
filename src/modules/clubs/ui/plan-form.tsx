"use client";

import { useActionState, useEffect, useState } from "react";
import { upsertMembershipPlan, type ClubActionState } from "../application/actions";
import { planKindLabels, type MembershipPlan, type MembershipPlanKind, type MembershipPlanMode } from "../domain/plans";
import { ActionMessage } from "@/shared/ui/action-message";
import { SubmitButton } from "@/shared/ui/submit-button";

// Al elegir el tipo se sugiere una regla (el admin puede cambiarla).
const kindDefaults: Record<MembershipPlanKind, { mode: MembershipPlanMode; percent: string; placeholder: string }> = {
  standard: { mode: "none", percent: "0", placeholder: "Socio individual" },
  family: { mode: "percent", percent: "20", placeholder: "Plan Familiar 1" },
  scholarship: { mode: "percent", percent: "100", placeholder: "Becado 100%" },
};

export function PlanForm({ organizationId, plan, onSaved }: { organizationId: string; plan?: MembershipPlan; onSaved?: () => void }) {
  const [state, action] = useActionState<ClubActionState, FormData>(upsertMembershipPlan, {});
  const [kind, setKind] = useState<MembershipPlanKind>(plan?.kind ?? "standard");
  const [mode, setMode] = useState<MembershipPlanMode>(plan?.mode ?? "none");
  const [percent, setPercent] = useState(plan ? String(plan.discountBps / 100) : "0");
  useEffect(() => { if (state.success && onSaved) onSaved(); }, [state.success, onSaved]);

  function pickKind(next: MembershipPlanKind) {
    setKind(next);
    if (!plan) { setMode(kindDefaults[next].mode); setPercent(kindDefaults[next].percent); }
  }

  return <form action={action} className="grid gap-4">
    <input type="hidden" name="organizationId" value={organizationId}/>
    {plan && <input type="hidden" name="id" value={plan.id}/>}
    <label className="label">Nombre<input className="field" name="name" placeholder={kindDefaults[kind].placeholder} defaultValue={plan?.name} required maxLength={60}/></label>
    <label className="label">Tipo
      <select className="field" name="kind" value={kind} onChange={(event) => pickKind(event.target.value as MembershipPlanKind)}>
        {(Object.keys(planKindLabels) as MembershipPlanKind[]).map((value) => <option key={value} value={value}>{planKindLabels[value]}</option>)}
      </select>
    </label>
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-semibold">Cuánto paga</legend>
      {([["none", "Cuota completa (sin descuento)"], ["percent", "Descuento en %"], ["fixed", "Valor fijo por cuota"]] as const).map(([value, label]) => <label key={value} className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm font-semibold has-[:checked]:border-[var(--accent)]">
        <input type="radio" name="mode" value={value} checked={mode === value} onChange={() => setMode(value)} className="size-4 accent-[var(--accent)]"/>{label}
      </label>)}
    </fieldset>
    {mode === "percent" && <label className="label">Descuento (%)<input className="field" name="percent" type="number" min="0" max="100" step="0.5" value={percent} onChange={(event) => setPercent(event.target.value)} required/><span className="text-xs font-normal text-neutral-500">100% = no paga cuota (becado total). Se aplica a cada cuota del socio: la del club y la de cada división.</span></label>}
    {mode === "fixed" && <label className="label">Valor por cuota ($)<input className="field" name="fixedAmount" type="number" min="0" step="0.01" defaultValue={plan ? plan.fixedAmount / 100 : undefined} placeholder="0" required/><span className="text-xs font-normal text-neutral-500">Reemplaza el precio de cada cuota (club y divisiones). Con $0 no paga: sirve para becados.</span></label>}
    <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="active" value="true" defaultChecked={plan?.active ?? true} className="size-4"/>Activo (se puede asignar a socios)</label>
    <ActionMessage message={state.error}/><ActionMessage message={state.success} tone="success"/>
    <SubmitButton className="btn btn-primary w-fit">{plan ? "Guardar cambios" : "Crear plan"}</SubmitButton>
  </form>;
}
