"use client";

import { useActionState } from "react";
import { updateOrgPayoutDetails, type PayoutDetailsState } from "../application/payout-details-actions";
import { SubmitButton } from "@/shared/ui/submit-button";
import { ActionMessage } from "@/shared/ui/action-message";

const initial: PayoutDetailsState = {};

export function PayoutDetailsForm({ organizationId, holder, cuit, alias, cbu }: { organizationId: string; holder: string | null; cuit: string | null; alias: string | null; cbu: string | null }) {
  const [state, action] = useActionState(updateOrgPayoutDetails, initial);
  return <form action={action} className="grid gap-3 sm:grid-cols-2">
    <input type="hidden" name="organizationId" value={organizationId}/>
    <label className="label">Titular de la cuenta<input className="field" name="holder" defaultValue={holder ?? ""} maxLength={120}/></label>
    <label className="label">CUIT / CUIL<input className="field" name="cuit" defaultValue={cuit ?? ""} inputMode="numeric" maxLength={13}/></label>
    <label className="label">Alias<input className="field" name="alias" defaultValue={alias ?? ""} maxLength={20} placeholder="mi.alias"/></label>
    <label className="label">CBU / CVU (22 números)<input className="field" name="cbu" defaultValue={cbu ?? ""} inputMode="numeric" maxLength={22}/></label>
    <div className="grid gap-3 sm:col-span-2"><ActionMessage message={state.error}/><ActionMessage message={state.success} tone="success"/><SubmitButton className="btn btn-primary w-fit" pendingLabel="Guardando…">Guardar datos de cobro</SubmitButton></div>
  </form>;
}
