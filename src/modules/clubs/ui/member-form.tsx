"use client";

import { useActionState, useState } from "react";
import { createMembership, type ClubActionState } from "../application/actions";
import { ActionMessage } from "@/shared/ui/action-message";
import { SubmitButton } from "@/shared/ui/submit-button";
import { CustomerLinkPicker } from "./customer-link-picker";
import type { CustomerCandidate } from "../domain/club";

type Category = { id: string; name: string };

export function MemberForm({ organizationId, categories }: { organizationId: string; categories: Category[] }) {
  const [state, action] = useActionState<ClubActionState, FormData>(createMembership, {});
  const [linked, setLinked] = useState<CustomerCandidate | null>(null);

  return <div className="mt-7 grid gap-5">
    <div className="card p-5 sm:p-7"><CustomerLinkPicker organizationId={organizationId} selected={linked} onSelect={setLinked} onClear={() => setLinked(null)}/></div>
    <form action={action} className="card grid gap-5 p-5 sm:p-7">
    <input type="hidden" name="organizationId" value={organizationId}/>
    {linked && <input type="hidden" name="customerId" value={linked.customerId}/>}

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
      <label className="label">N° de socio<input className="field" name="memberNumber" required/></label>
      <label className="label">Categoría
        <select className="field" name="categoryId" required defaultValue="">
          <option value="" disabled>Elegí una categoría</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
    </div>
    {categories.length === 0 && <p className="status-warning rounded-xl p-3 text-sm">Todavía no creaste ninguna categoría de membresía. Cargá al menos una antes de dar de alta socios.</p>}
    <ActionMessage message={state.error}/>
    <SubmitButton>Guardar socio</SubmitButton>
    </form>
  </div>;
}
