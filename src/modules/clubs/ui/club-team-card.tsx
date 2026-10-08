"use client";

import { useActionState } from "react";
import { Clock3, RefreshCw, UserPlus, UserRound, X } from "lucide-react";
import { inviteClubCollaborator, removeClubCollaborator, updateClubCollaboratorRole } from "../application/team-actions";
import type { ClubTeamEntry } from "../application/team";
import { SubmitButton } from "@/shared/ui/submit-button";
import { ActionMessage } from "@/shared/ui/action-message";
import { CLUB_ROLES, CLUB_ROLE_ORDER } from "../domain/club-roles";
import { ShareLinkButtons } from "@/modules/promoters/ui/share-link-buttons";

export function ClubTeamCard({ organizationId, team }: { organizationId: string; team: ClubTeamEntry[] }) {
  const [state, action] = useActionState(inviteClubCollaborator, {});
  const [resendState, resendAction] = useActionState(inviteClubCollaborator, {});
  return <div className="card p-5 sm:p-7">
    <div className="flex items-center gap-2"><UserRound size={18} className="text-[var(--accent)]"/><h2 className="text-lg font-black">Colaboradores del club</h2></div>
    <p className="mt-2 text-sm leading-6 text-neutral-500">Sumá a alguien para que te ayude con el club. Cada rol define qué puede hacer; nadie del equipo ve ni cambia la identidad del club, los pagos, los eventos ni el equipo.</p>
    <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">{CLUB_ROLE_ORDER.map((role) => <div className="rounded-xl border border-[var(--border)] px-3 py-2.5" key={role}><dt className="font-bold">{CLUB_ROLES[role].label}</dt><dd className="mt-0.5 text-xs leading-5 text-neutral-500">{CLUB_ROLES[role].description}</dd></div>)}</dl>
    {team.length > 0 && <div className="mt-4 grid gap-2">{team.map((entry) => <div className="grid gap-2 rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm" key={`${entry.kind}-${entry.id}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0"><span className="block truncate font-semibold">{entry.email}</span>{entry.kind === "invitation" && <span className="mt-0.5 flex items-center gap-1 text-xs text-amber-500"><Clock3 aria-hidden size={12}/>Invitación pendiente · {CLUB_ROLES[entry.role].label}</span>}</span>
        <div className="flex shrink-0 items-center gap-1">
          {entry.kind === "invitation" && <form action={resendAction}><input type="hidden" name="organizationId" value={organizationId}/><input type="hidden" name="email" value={entry.email}/><input type="hidden" name="role" value={entry.role}/><button type="submit" className="btn btn-ghost min-h-9 px-2 text-xs" aria-label={`Reenviar invitación a ${entry.email}`}><RefreshCw size={14}/>Reenviar</button></form>}
          <form action={removeClubCollaborator}>
            <input type="hidden" name="organizationId" value={organizationId}/>
            <input type="hidden" name="id" value={entry.id}/>
            <input type="hidden" name="kind" value={entry.kind}/>
            <button type="submit" className="btn btn-ghost btn-icon min-h-9" aria-label={entry.kind === "invitation" ? `Cancelar invitación a ${entry.email}` : `Quitar a ${entry.email}`}><X size={15}/></button>
          </form>
        </div>
      </div>
      {entry.kind === "member" && <form action={updateClubCollaboratorRole} className="flex items-center gap-2">
        <input type="hidden" name="organizationId" value={organizationId}/><input type="hidden" name="userId" value={entry.id}/>
        <select className="field min-h-9 flex-1 py-1 text-xs" name="role" defaultValue={entry.role} aria-label={`Rol de ${entry.email}`}>{CLUB_ROLE_ORDER.map((role) => <option key={role} value={role}>{CLUB_ROLES[role].label}</option>)}</select>
        <button type="submit" className="btn btn-secondary min-h-9 px-3 text-xs">Guardar rol</button>
      </form>}
    </div>)}</div>}
    {resendState.error && <div className="mt-2"><ActionMessage message={resendState.error}/></div>}
    {resendState.success && <div className="mt-2"><ActionMessage message={resendState.success} tone="success"/></div>}
    {resendState.acceptUrl && <div className="mt-3"><ShareLinkButtons url={resendState.acceptUrl} shareLabel="Compartir invitación" compact/></div>}
    <form action={action} className="mt-4 grid gap-2 sm:grid-cols-[1fr_12rem_auto]">
      <input type="hidden" name="organizationId" value={organizationId}/>
      <input className="field" name="email" type="email" placeholder="email@ejemplo.com" required aria-label="Email del colaborador"/>
      <select className="field" name="role" defaultValue="admin" aria-label="Rol">{CLUB_ROLE_ORDER.map((role) => <option key={role} value={role}>{CLUB_ROLES[role].label}</option>)}</select>
      <SubmitButton className="btn btn-primary shrink-0" pendingLabel="Invitando…"><UserPlus size={16}/>Invitar</SubmitButton>
    </form>
    <p className="mt-2 text-xs text-neutral-500">La persona tiene que ingresar con ese mismo email (si no tiene cuenta, la crea al aceptar).</p>
    <div className="mt-2"><ActionMessage message={state.error}/><ActionMessage message={state.success} tone="success"/></div>
    {state.acceptUrl && <div className="mt-3"><ShareLinkButtons url={state.acceptUrl} shareLabel="Compartir invitación" compact/></div>}
  </div>;
}
