"use client";

import { useActionState, useState } from "react";
import { createMembership, type ClubActionState } from "../application/actions";
import { ActionMessage } from "@/shared/ui/action-message";
import { SubmitButton } from "@/shared/ui/submit-button";
import { CustomerLinkPicker } from "./customer-link-picker";
import type { CustomerCandidate } from "../domain/club";

type Category = { id: string; name: string };

export function MemberForm({ organizationId, categories, plans = [], suggestedNumber }: { organizationId: string; categories: Category[]; plans?: Array<{ id: string; name: string; description: string }>; suggestedNumber?: string }) {
  const [state, action] = useActionState<ClubActionState, FormData>(createMembership, {});
  const [linked, setLinked] = useState<CustomerCandidate | null>(null);
  const [isStudent, setIsStudent] = useState(false);

  return <div className="mt-7 grid gap-5">
    <div className="card p-5 sm:p-7"><CustomerLinkPicker organizationId={organizationId} selected={linked} onSelect={setLinked} onClear={() => setLinked(null)} allowMembers={isStudent}/></div>
    <form action={action} className="card grid gap-5 p-5 sm:p-7">
    <input type="hidden" name="organizationId" value={organizationId}/>
    {linked && <input type="hidden" name="customerId" value={linked.customerId}/>}

    <label className="flex items-start gap-3 rounded-xl border border-white/[.08] p-4 text-sm">
      <input type="checkbox" className="mt-1" checked={isStudent} onChange={(event) => setIsStudent(event.target.checked)}/>
      <span><strong>Es un alumno menor, a cargo de un tutor</strong><span className="mt-1 block text-xs text-neutral-500">El tutor es quien recibe los avisos y paga las cuotas. Un mismo tutor puede tener varios hijos anotados.</span></span>
    </label>
    {isStudent && <div className="grid gap-4 rounded-xl border border-white/[.08] p-4">
      <p className="text-sm font-bold">Datos del alumno</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="label">Nombre del alumno<input className="field" name="studentFirstName" required/></label>
        <label className="label">Apellido del alumno<input className="field" name="studentLastName" required/></label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="label">Fecha de nacimiento<input className="field" name="birthDate" type="date" required/></label>
        <label className="label">DNI del alumno <span className="font-normal text-neutral-500">(opcional)</span><input className="field" name="studentDocument" inputMode="numeric"/></label>
      </div>
      <p className="text-sm font-bold">Datos del tutor (quien paga)</p>
    </div>}

    {!linked && <>
      <p className="text-xs text-neutral-500">Si la persona ya compró una entrada antes y no la encontrás buscando arriba, completá los datos a mano — igual evitamos duplicarla por DNI o email.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="label">Nombre<input className="field" name="firstName" required/></label>
        <label className="label">Apellido<input className="field" name="lastName" required/></label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="label">DNI<input className="field" name="document" inputMode="numeric"/></label>
        <label className="label">Email<input className="field" name="email" type="email" required/></label>
      </div>
      <label className="label">Teléfono<input className="field" name="phone"/></label>
    </>}

    <div className="grid gap-4 sm:grid-cols-2">
      <label className="label">N° de socio<input className="field" name="memberNumber" defaultValue={suggestedNumber} required/><span className="mt-1 block text-xs font-normal text-neutral-500">Se completa solo con el siguiente número. Si tu club ya tiene su numeración, podés cambiarlo.</span></label>
      <label className="label">Categoría
        <select className="field" name="categoryId" required defaultValue="">
          <option value="" disabled>Elegí una categoría</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
    </div>
    {plans.length > 0 && <label className="label">Membresía <span className="font-normal text-neutral-500">(opcional)</span>
      <select className="field" name="planId" defaultValue="">
        <option value="">Sin plan · cuota completa</option>
        {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {plan.description}</option>)}
      </select>
      <span className="mt-1 block text-xs font-normal text-neutral-500">Define cuánto paga: plan familiar, becado, etc. Se aplica a todas sus cuotas.</span>
    </label>}
    {categories.length === 0 && <p className="status-warning rounded-xl p-3 text-sm">Todavía no creaste ninguna categoría de membresía. Cargá al menos una antes de dar de alta socios.</p>}
    <ActionMessage message={state.error}/>
    <SubmitButton>Guardar socio</SubmitButton>
    </form>
  </div>;
}
