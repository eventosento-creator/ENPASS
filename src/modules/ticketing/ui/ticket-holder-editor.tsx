"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { updateTicketHolderAction, type HolderActionState } from "../application/actions";
import type { TicketPresentation } from "../application/queries";
import { SubmitButton } from "@/shared/ui/submit-button";
import { ActionMessage } from "@/shared/ui/action-message";

const initial: HolderActionState = {};

/** Nombres de las entradas: cada una tiene su titular y el comprador puede cambiarlo hasta 3 horas antes del evento. */
export function TicketHolderEditor({ tickets }: { tickets: TicketPresentation[] }) {
  const editable = tickets.filter((ticket) => ticket.credentialKind === "ticket" && ticket.status === "valid");
  if (editable.length === 0) return null;
  return <section className="card mt-6 p-5" aria-label="Nombres de las entradas">
    <h2 className="font-black">Nombres de las entradas</h2>
    <p className="mt-1 text-xs leading-5 text-neutral-500">Cada entrada sale a nombre de una persona y ese nombre figura en la lista de la puerta. Si cambia quién va, podés cambiarlo hasta 3 horas antes del evento.</p>
    <ul className="mt-3 divide-y divide-[var(--border)]">{editable.map((ticket) => <HolderRow key={`${ticket.id}-${ticket.holderName}-${ticket.holderDocument ?? ""}`} ticket={ticket}/>)}</ul>
  </section>;
}

function HolderRow({ ticket }: { ticket: TicketPresentation }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(updateTicketHolderAction, initial);
  // Al guardar se recarga la lista: la fila se vuelve a armar con el nombre nuevo y el formulario se cierra solo.
  useEffect(() => { if (state.success) router.refresh(); }, [state.success, router]);
  return <li className="py-3">
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0"><p className="truncate text-sm font-bold">{ticket.holderName}</p><p className="truncate text-xs text-neutral-500">{ticket.ticketTypeName} · #{ticket.shortCode}</p></div>
      {ticket.canEditHolder ? <button type="button" className="btn btn-ghost min-h-9 shrink-0 px-3 text-xs" onClick={() => setOpen((value) => !value)} aria-expanded={open}><Pencil size={14}/>Cambiar nombre</button> : <span className="shrink-0 text-xs text-neutral-500">No se puede cambiar</span>}
    </div>
    {open && ticket.canEditHolder && <form action={action} className="mt-3 grid gap-3 rounded-xl bg-[var(--surface-strong)]/50 p-3">
      <input type="hidden" name="ticketId" value={ticket.id}/>
      <div className="grid gap-3 sm:grid-cols-2"><label className="label">Nombre<input className="field" name="firstName" defaultValue={ticket.holderFirstName} maxLength={80} required/></label><label className="label">Apellido<input className="field" name="lastName" defaultValue={ticket.holderLastName} maxLength={80} required/></label></div>
      {ticket.requireDocument && <label className="label">DNI<input className="field" name="document" defaultValue={ticket.holderDocument ?? ""} inputMode="numeric" pattern="[0-9.]{7,10}" minLength={7} maxLength={10} required/></label>}
      <ActionMessage message={state.error}/>
      <div className="flex gap-2"><SubmitButton className="btn btn-primary" pendingLabel="Guardando…">Guardar nombre</SubmitButton><button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancelar</button></div>
    </form>}
    {!open && state.success && <p className="mt-2 text-xs text-emerald-600" role="status">{state.success}</p>}
  </li>;
}
