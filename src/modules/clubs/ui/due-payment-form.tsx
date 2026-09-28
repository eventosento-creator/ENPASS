"use client";

import { useActionState, useState } from "react";
import { recordManualDuePayment, type ClubActionState } from "../application/actions";
import { ActionMessage } from "@/shared/ui/action-message";
import { SubmitButton } from "@/shared/ui/submit-button";

export function DuePaymentForm({ membershipId, dueId, defaultAmount, onClose }: { membershipId: string; dueId: string; defaultAmount: number; onClose: () => void }) {
  const [state, action] = useActionState<ClubActionState, FormData>(recordManualDuePayment, {});
  const [method, setMethod] = useState<"cash" | "transfer" | "other">("cash");
  return <form action={action} className="mt-4 grid gap-3 rounded-xl border border-white/[.08] p-4">
    <input type="hidden" name="membershipId" value={membershipId}/>
    <input type="hidden" name="dueId" value={dueId}/>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="label">Importe cobrado<input className="field" name="paidAmount" type="number" min="0" step="0.01" defaultValue={(defaultAmount / 100).toString()} required/></label>
      <label className="label">Medio<select className="field" name="paymentMethod" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}><option value="cash">Efectivo</option><option value="transfer">Transferencia</option><option value="other">Otro</option></select></label>
    </div>
    <label className="label">Referencia (opcional)<input className="field" name="paymentReference" placeholder="N° de comprobante"/></label>
    <ActionMessage message={state.error}/>
    <div className="flex gap-2"><SubmitButton className="btn btn-primary">Registrar pago</SubmitButton><button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button></div>
  </form>;
}
