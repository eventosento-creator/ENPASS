"use client";

import { useActionState } from "react";
import { Clock3, UserPlus, UserRound, X } from "lucide-react";
import { inviteClubCollaborator, removeClubCollaborator } from "../application/team-actions";
import type { ClubTeamEntry } from "../application/team";
import { SubmitButton } from "@/shared/ui/submit-button";
import { ActionMessage } from "@/shared/ui/action-message";
import { ShareLinkButtons } from "@/modules/promoters/ui/share-link-buttons";

export function ClubTeamCard({ organizationId, team }: { organizationId: string; team: ClubTeamEntry[] }) {
  const [state, action] = useActionState(inviteClubCollaborator, {});
  return <div className="card p-5 sm:p-7">
    <div className="flex items-center gap-2"><UserRound size={18} className="text-[var(--accent)]"/><h2 className="text-lg font-black">Colaboradores del club</h2></div>
    <p className="mt-2 text-sm leading-6 text-neutral-500">Sumá a alguien (un tesorero, un coordinador) para que te ayude con los <b>socios, categorías, divisiones y cuotas</b>. No ve ni cambia la identidad del club, los pagos, los eventos ni el equipo.</p>
    {team.length > 0 && <div className="mt-4 grid gap-2">{team.map((entry) => <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm" key={`${entry.kind}-${entry.id}`}>
      <span className="min-w-0"><span className="block truncate font-semibold">{entry.email}</span>{entry.kind === "invitation" && <span className="mt-0.5 flex items-center gap-1 text-xs text-amber-500"><Clock3 aria-hidden size={12}/>Invitación pendiente</span>}</span>
      <form action={removeClubCollaborator}>
        <input type="hidden" name="organizationId" value={organizationId}/>
        <input type="hidden" name="id" value={entry.id}/>
        <input type="hidden" name="kind" value={entry.kind}/>
        <button type="submit" className="btn btn-ghost btn-icon min-h-9" aria-label={entry.kind === "invitation" ? `Cancelar invitación a ${entry.email}` : `Quitar a ${entry.email}`}><X size={15}/></button>
      </form>
    </div>)}</div>}
    <form action={action} className="mt-4 flex flex-col gap-2 sm:flex-row">
      <input type="hidden" name="organizationId" value={organizationId}/>
      <input className="field flex-1" name="email" type="email" placeholder="email@ejemplo.com" required/>
      <SubmitButton className="btn btn-primary shrink-0" pendingLabel="Invitando…"><UserPlus size={16}/>Invitar</SubmitButton>
    </form>
    <p className="mt-2 text-xs text-neutral-500">La persona tiene que ingresar con ese mismo email (si no tiene cuenta, la crea al aceptar).</p>
    <div className="mt-2"><ActionMessage message={state.error}/><ActionMessage message={state.success} tone="success"/></div>
    {state.acceptUrl && <div className="mt-3"><ShareLinkButtons url={state.acceptUrl} shareLabel="Compartir invitación" compact/></div>}
  </div>;
}
