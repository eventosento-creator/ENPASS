"use client";

import { useActionState } from "react";
import { updateClubPayoutDetails, type ClubActionState } from "../application/actions";
import { ActionMessage } from "@/shared/ui/action-message";
import { SubmitButton } from "@/shared/ui/submit-button";

export function ClubPayoutDetailsForm({ organizationId, details }: { organizationId: string; details: { holder: string; cuit: string; alias: string; cbu: string } }) {
  const [state, action] = useActionState<ClubActionState, FormData>(updateClubPayoutDetails, {});
  return <form action={action} className="grid gap-4">
    <input type="hidden" name="organizationId" value={organizationId}/>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="label">Titular de la cuenta<input className="field" name="holder" defaultValue={details.holder} maxLength={120} placeholder="Club Obras"/></label>
      <label className="label">CUIT del titular<input className="field" name="cuit" defaultValue={details.cuit} inputMode="numeric" maxLength={13} placeholder="30-12345678-9"/></label>
      <label className="label">Alias<input className="field" name="alias" defaultValue={details.alias} maxLength={20} autoCapitalize="none" placeholder="club.obras.cuotas"/></label>
      <label className="label">CBU / CVU<input className="field" name="cbu" defaultValue={details.cbu} inputMode="numeric" maxLength={24} placeholder="22 números"/></label>
    </div>
    <p className="text-xs text-neutral-500">Es la cuenta a la que ENPASS te transfiere las cuotas cobradas (liquidación mensual). Cargá el alias o el CBU/CVU.</p>
    <ActionMessage message={state.error}/><ActionMessage message={state.success} tone="success"/>
    <SubmitButton className="btn btn-primary w-fit">Guardar datos de cobro</SubmitButton>
  </form>;
}
