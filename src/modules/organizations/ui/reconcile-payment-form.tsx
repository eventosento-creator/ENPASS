"use client";

import { useActionState } from "react";
import { reconcilePayment, type ReconcileState } from "../application/admin-actions";
import { ActionMessage } from "@/shared/ui/action-message";
import { SubmitButton } from "@/shared/ui/submit-button";

export function ReconcilePaymentForm() {
  const [state, action] = useActionState<ReconcileState, FormData>(reconcilePayment, {});
  return <form action={action} className="card mt-8 grid max-w-xl gap-4 p-5">
    <label className="label">ID de operación de Mercado Pago<input className="field" name="mpPaymentId" inputMode="numeric" placeholder="182005438196" required/></label>
    <ActionMessage message={state.error}/><ActionMessage message={state.success} tone="success"/>
    <SubmitButton className="btn btn-primary w-fit" pendingLabel="Reprocesando…">Reprocesar pago</SubmitButton>
  </form>;
}
