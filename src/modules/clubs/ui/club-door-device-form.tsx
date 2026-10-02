"use client";

import { useActionState, useState } from "react";
import { Check, Copy } from "lucide-react";
import { createClubDoorDevice, type ClubAccessState } from "../application/club-access-actions";
import { ActionMessage } from "@/shared/ui/action-message";
import { SubmitButton } from "@/shared/ui/submit-button";

export function ClubDoorDeviceForm({ organizationId }: { organizationId: string }) {
  const [state, action] = useActionState<ClubAccessState, FormData>(createClubDoorDevice, {});
  const [copied, setCopied] = useState(false);
  return <form action={action} className="grid gap-3">
    <input type="hidden" name="organizationId" value={organizationId}/>
    <div className="flex flex-wrap items-end gap-3">
      <label className="label min-w-48 flex-1">Nombre de la puerta<input className="field" name="name" placeholder="Entrada principal" required minLength={2}/></label>
      <SubmitButton className="btn btn-primary" pendingLabel="Creando…">Generar PIN</SubmitButton>
    </div>
    <ActionMessage message={state.error}/><ActionMessage message={state.success} tone="success"/>
    {state.pin && <div className="rounded-2xl border border-lime-400/25 bg-lime-400/[.07] p-5 text-center">
      <p className="text-xs font-black uppercase tracking-[.2em] text-lime-300">PIN de la puerta</p>
      <p className="mt-3 font-mono text-4xl font-black tracking-[.16em]">{state.pin.slice(0, 3)} {state.pin.slice(3)}</p>
      <p className="mt-3 text-xs leading-5 text-lime-100/70">Ingresalo en la página de la puerta desde el celu o tablet. Si no lo usás vence en 30 minutos; una vez activado sirve para volver a abrir esa misma puerta las veces que haga falta.</p>
      <button className="btn btn-ghost mt-4 w-full" type="button" onClick={() => { void navigator.clipboard.writeText(state.pin!); setCopied(true); }} disabled={copied}>{copied ? <Check size={16}/> : <Copy size={16}/>} {copied ? "Copiado" : "Copiar PIN"}</button>
    </div>}
  </form>;
}
