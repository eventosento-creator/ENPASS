"use client";

import { useActionState, useState } from "react";
import { BadgePercent } from "lucide-react";
import Link from "next/link";
import { setMembershipPlan, type ClubActionState } from "../application/actions";
import { applyPlan, describePlan, type MembershipPlan } from "../domain/plans";
import { ActionMessage } from "@/shared/ui/action-message";
import { SubmitButton } from "@/shared/ui/submit-button";
import { formatMoney } from "@/shared/lib/format";

/** Plan de cobro del socio (estándar, familiar, becado…) y cuánto pagaría con cada uno. */
export function MembershipPlanCard({ membershipId, currentPlanId, plans, categoryFee, categoryName, currency }: { membershipId: string; currentPlanId: string | null; plans: MembershipPlan[]; categoryFee: number; categoryName: string; currency: string }) {
  const [state, action] = useActionState<ClubActionState, FormData>(setMembershipPlan, {});
  const [selected, setSelected] = useState(currentPlanId ?? "");
  const plan = plans.find((candidate) => candidate.id === selected) ?? null;
  const current = plans.find((candidate) => candidate.id === currentPlanId) ?? null;
  return <section className="card mt-6 p-5 sm:p-6">
    <div className="flex items-center gap-2"><BadgePercent size={18} className="text-[var(--accent)]"/><h2 className="text-lg font-bold">Membresía</h2></div>
    <p className="mt-2 text-sm text-neutral-500">Define cuánto paga este socio. Actualmente: <b>{current ? current.name : "sin plan (cuota completa)"}</b>. El cambio rige desde las <b>próximas</b> cuotas; las ya generadas no se modifican.</p>
    <form action={action} className="mt-4 flex flex-wrap items-end gap-3">
      <input type="hidden" name="membershipId" value={membershipId}/>
      <label className="label min-w-[14rem] flex-1">Plan de cobro
        <select className="field" name="planId" value={selected} onChange={(event) => setSelected(event.target.value)}>
          <option value="">Sin plan · cuota completa</option>
          {plans.filter((candidate) => candidate.active || candidate.id === currentPlanId).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {describePlan(candidate, currency)}</option>)}
        </select>
      </label>
      <SubmitButton className="btn btn-primary" pendingLabel="Guardando…">Guardar</SubmitButton>
    </form>
    {categoryFee > 0 && <p className="mt-3 text-sm text-neutral-400">Cuota de {categoryName}: <span className="line-through opacity-60">{plan && applyPlan(categoryFee, plan) !== categoryFee ? formatMoney(categoryFee, currency) : ""}</span> <b>{formatMoney(applyPlan(categoryFee, plan), currency)}</b> por mes{plan && applyPlan(categoryFee, plan) === 0 ? " (no se genera)" : ""}.</p>}
    {plans.length === 0 && <p className="mt-3 text-xs text-neutral-500">Todavía no creaste planes. <Link href={"/app/socios/membresias" as never} className="font-bold underline">Crealos en Membresías</Link>.</p>}
    <div className="mt-2"><ActionMessage message={state.error}/><ActionMessage message={state.success} tone="success"/></div>
  </section>;
}
