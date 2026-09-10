"use client";

import { useActionState } from "react";
import { NotebookText, Tag } from "lucide-react";
import { updateCustomerNotes } from "../application/actions";
import { ActionMessage } from "@/shared/ui/action-message";
import { SubmitButton } from "@/shared/ui/submit-button";

export function CustomerNotesForm({ customerId, notes, tags }: { customerId: string; notes: string; tags: string[] }) {
  const [state, action] = useActionState(updateCustomerNotes, {});
  return <div className="card p-5 sm:p-7">
    <div className="flex items-center gap-2"><NotebookText size={18} className="text-[var(--accent)]"/><h2 className="section-title">Notas internas</h2></div>
    <p className="mt-2 text-sm text-neutral-500">Solo las ve tu equipo. El cliente nunca las ve.</p>
    <form action={action} className="mt-5 grid gap-4">
      <input type="hidden" name="customerId" value={customerId}/>
      <label className="label"><span className="flex items-center gap-1.5"><Tag size={13}/>Etiquetas</span><input className="field" name="tags" defaultValue={tags.join(", ")} placeholder="VIP, reventa, problemático"/><span className="text-xs font-normal text-neutral-600">Separalas con comas.</span></label>
      <label className="label">Notas<textarea className="field min-h-28 resize-y" name="notes" defaultValue={notes} placeholder="Cualquier detalle que quieras recordar sobre este cliente."/></label>
      <ActionMessage message={state.error}/><ActionMessage message={state.success} tone="success"/>
      <SubmitButton className="btn btn-primary" pendingLabel="Guardando…">Guardar</SubmitButton>
    </form>
  </div>;
}
