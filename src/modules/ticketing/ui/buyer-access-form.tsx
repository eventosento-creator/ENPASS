"use client";

import { useActionState } from "react";
import { Mail } from "lucide-react";
import { requestBuyerAccessAction, type BuyerAccessActionState } from "../application/actions";
import { SubmitButton } from "@/shared/ui/submit-button";

const initialState: BuyerAccessActionState = { message: null };

export function BuyerAccessForm() {
  const [state, action] = useActionState(requestBuyerAccessAction, initialState);
  return <form action={action} className="mt-7 grid gap-4">
    <label className="label">Email de compra<input className="field" name="email" type="email" autoComplete="email" inputMode="email" placeholder="vos@ejemplo.com" required/></label>
    <SubmitButton className="btn btn-primary w-full" pendingLabel="Enviando acceso…"><Mail size={18}/> Enviarme acceso</SubmitButton>
    {state.message && <p className="rounded-xl border border-[var(--accent)]/15 bg-[var(--accent)]/[.05] p-4 text-sm leading-6 text-neutral-300" role="status">{state.message}</p>}
  </form>;
}
