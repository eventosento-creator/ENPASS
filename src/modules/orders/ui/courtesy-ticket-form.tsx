"use client";

import { useActionState, useState } from "react";
import { Gift, X } from "lucide-react";
import { issueCourtesyTicket } from "../application/actions";
import { ActionMessage } from "@/shared/ui/action-message";
import { SubmitButton } from "@/shared/ui/submit-button";

export function CourtesyTicketForm({ eventId, ticketTypes }: { eventId: string; ticketTypes: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(issueCourtesyTicket, {});

  if (!ticketTypes.length) return null;

  if (!open) return <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}><Gift size={17}/>Agregar cortesía</button>;

  return <div className="card p-5 sm:p-6">
    <div className="flex items-center justify-between gap-4"><div className="flex items-center gap-2"><Gift size={18} className="text-[var(--accent)]"/><h2 className="section-title">Nueva cortesía</h2></div><button type="button" className="grid size-9 place-items-center rounded-full text-neutral-500 hover:bg-white/[.06]" onClick={() => setOpen(false)} aria-label="Cerrar"><X size={16}/></button></div>
    <p className="mt-2 text-sm text-neutral-500">Emite una entrada gratuita sin pasar por el checkout. Llega por email al instante.</p>
    <form action={action} className="mt-5 grid gap-4">
      <input type="hidden" name="eventId" value={eventId}/>
      <div className="grid gap-4 sm:grid-cols-2"><label className="label">Nombre<input className="field" name="firstName" required/></label><label className="label">Apellido<input className="field" name="lastName" required/></label></div>
      <label className="label">Email<input className="field" name="email" type="email" required/></label>
      <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
        <label className="label">Tipo de entrada<select className="field" name="ticketTypeId" required defaultValue="">
          <option value="" disabled>Elegí un tipo</option>
          {ticketTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
        </select></label>
        <label className="label">Cantidad<input className="field" name="quantity" type="number" min="1" max="10" defaultValue="1" required/></label>
      </div>
      <ActionMessage message={state.error}/><ActionMessage message={state.success} tone="success"/>
      <SubmitButton className="btn btn-primary" pendingLabel="Generando…"><Gift size={17}/>Generar cortesía</SubmitButton>
    </form>
  </div>;
}
