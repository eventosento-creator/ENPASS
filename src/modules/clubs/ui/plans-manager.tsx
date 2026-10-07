"use client";

import { useState } from "react";
import { BadgePercent, Pencil, Plus, X } from "lucide-react";
import { deleteMembershipPlan } from "../application/actions";
import { describePlan, planKindLabels, type MembershipPlan } from "../domain/plans";
import { DeleteItemButton } from "./delete-item-button";
import { PlanForm } from "./plan-form";
import { EmptyState } from "@/shared/ui/empty-state";

export function PlansManager({ organizationId, plans, currency }: { organizationId: string; plans: MembershipPlan[]; currency: string }) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<MembershipPlan | null>(null);
  const modal = (title: string, close: () => void, children: React.ReactNode) => <div className="fixed inset-0 z-50 bg-black/70 p-3 backdrop-blur-sm sm:grid sm:place-items-center" role="dialog" aria-modal="true"><div className="ml-auto h-full w-full max-w-md overflow-y-auto rounded-[1.4rem] border border-white/10 bg-[var(--surface)] p-5 shadow-2xl sm:mx-auto sm:h-auto sm:p-7"><div className="mb-6 flex items-center justify-between"><h2 className="text-xl font-black">{title}</h2><button className="grid size-10 place-items-center rounded-full bg-white/[.06]" onClick={close} aria-label="Cerrar"><X size={18}/></button></div>{children}</div></div>;

  return <>
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3"><p className="max-w-xl text-sm text-neutral-500">Definen <b>cuánto paga</b> cada socio: cuota completa, planes familiares o becados. Cada socio tiene un plan asignado; sin plan paga la cuota completa. El plan rige desde las próximas cuotas.</p><button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={18}/>Nuevo plan</button></div>
    <div className="mt-6">{plans.length ? <div className="grid gap-3">
      {plans.map((plan) => <div key={plan.id} className="card flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-bold">{plan.name}<span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] font-bold text-neutral-500">{planKindLabels[plan.kind]}</span></p>
          <p className="mt-1 text-sm text-neutral-500">{describePlan(plan, currency)} · {plan.memberCount} {plan.memberCount === 1 ? "socio" : "socios"}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${plan.active ? "status-success" : "text-neutral-500"}`}>{plan.active ? "Activo" : "Inactivo"}</span>
          <button className="btn btn-secondary" onClick={() => setEditing(plan)} aria-label={`Editar ${plan.name}`}><Pencil size={15}/></button>
          <DeleteItemButton action={deleteMembershipPlan} organizationId={organizationId} id={plan.id} name={plan.name} kind="plan"/>
        </div>
      </div>)}
    </div> : <EmptyState icon={BadgePercent} title="Todavía no tenés planes de cobro" description="Creá, por ejemplo, 'Plan Familiar' con 20% de descuento o 'Becado' con 100%. Los socios sin plan pagan la cuota completa." action={<button className="btn btn-primary" onClick={() => setCreating(true)}>Nuevo plan</button>}/>}</div>
    {creating && modal("Nuevo plan", () => setCreating(false), <PlanForm organizationId={organizationId} onSaved={() => setCreating(false)}/>)}
    {editing && modal("Editar plan", () => setEditing(null), <PlanForm organizationId={organizationId} plan={editing} onSaved={() => setEditing(null)}/>)}
  </>;
}
