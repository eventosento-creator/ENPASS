"use client";

import { useActionState } from "react";
import { UserPlus, UserRound, X } from "lucide-react";
import { inviteCollaborator, removeCollaborator } from "../application/actions";
import type { EventCollaborator } from "../domain/collaborator";
import { SubmitButton } from "@/shared/ui/submit-button";
import { ActionMessage } from "@/shared/ui/action-message";
import { ShareLinkButtons } from "@/modules/promoters/ui/share-link-buttons";

export function CollaboratorsCard({ eventId, collaborators }: { eventId: string; collaborators: EventCollaborator[] }) {
  const [state, action] = useActionState(inviteCollaborator, {});
  return <div className="card p-5 sm:p-6">
    <div className="flex items-center gap-2"><UserRound size={18} className="text-[var(--accent)]"/><h2 className="section-title">Colaboradores</h2></div>
    <p className="mt-2 text-sm leading-6 text-neutral-500">Invitá a alguien a gestionar este evento (Entradas, Invitados, Mesas y Accesos) sin darle acceso al resto de tu organización.</p>
    {collaborators.length > 0 && <div className="mt-4 grid gap-2">{collaborators.map((collaborator) => <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm" key={collaborator.id}>
      <span className="truncate font-semibold">{collaborator.email}</span>
      <form action={removeCollaborator}>
        <input type="hidden" name="eventId" value={eventId}/>
        <input type="hidden" name="userId" value={collaborator.userId}/>
        <button type="submit" className="btn btn-ghost btn-icon min-h-9" aria-label={`Quitar a ${collaborator.email}`}><X size={15}/></button>
      </form>
    </div>)}</div>}
    <form action={action} className="mt-4 flex flex-col gap-2 sm:flex-row">
      <input type="hidden" name="eventId" value={eventId}/>
      <input className="field flex-1" name="email" type="email" placeholder="email@ejemplo.com" required/>
      <SubmitButton className="btn btn-primary shrink-0" pendingLabel="Invitando…"><UserPlus size={16}/>Invitar</SubmitButton>
    </form>
    <div className="mt-2"><ActionMessage message={state.error}/><ActionMessage message={state.success} tone="success"/></div>
    {state.acceptUrl && <div className="mt-3"><ShareLinkButtons url={state.acceptUrl} shareLabel="Compartir invitación" compact/></div>}
  </div>;
}
