"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { submitMembershipRequest, type MembershipRequestState } from "../application/public-actions";
import type { PublicClubCategory } from "../domain/club";
import { ActionMessage } from "@/shared/ui/action-message";
import { SubmitButton } from "@/shared/ui/submit-button";

export function MembershipRequestForm({ organizationId, categories }: { organizationId: string; categories: PublicClubCategory[] }) {
  const [state, action] = useActionState<MembershipRequestState, FormData>(submitMembershipRequest, {});

  if (state.success) return <div className="mt-5 flex items-start gap-3 rounded-xl border border-lime-300/20 bg-lime-300/[.06] p-4 text-sm text-lime-200">
    <CheckCircle2 className="mt-0.5 shrink-0" size={18}/>
    <p>Listo, mandamos tu solicitud. El club la va a revisar y te va a contactar por email.</p>
  </div>;

  return <form action={action} className="mt-5 grid gap-4">
    <input type="hidden" name="organizationId" value={organizationId}/>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="label">Nombre<input className="field" name="firstName" required maxLength={80}/></label>
      <label className="label">Apellido<input className="field" name="lastName" required maxLength={80}/></label>
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="label">Email<input className="field" name="email" type="email" required maxLength={160}/></label>
      <label className="label">Teléfono (opcional)<input className="field" name="phone" maxLength={30}/></label>
    </div>
    <label className="label">Categoría<select className="field" name="categoryId" required defaultValue="">
      <option value="" disabled>Elegí una categoría</option>
      {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
    </select></label>
    <label className="label">Mensaje (opcional)<textarea className="field min-h-20" name="message" maxLength={500} placeholder="Contanos algo más si querés"/></label>
    <ActionMessage message={state.error}/>
    <SubmitButton className="btn btn-primary w-fit">Enviar solicitud</SubmitButton>
  </form>;
}
