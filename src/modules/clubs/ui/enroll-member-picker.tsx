"use client";

import { useActionState, useState } from "react";
import { Search, X } from "lucide-react";
import { enrollMembershipInDivision, searchMembersForEnroll, type ClubActionState, type MemberSearchState } from "../application/actions";
import { SubmitButton } from "@/shared/ui/submit-button";

function EnrollButton({ membershipId, divisionId }: { membershipId: string; divisionId: string }) {
  const [state, action] = useActionState<ClubActionState, FormData>(enrollMembershipInDivision, {});
  if (state.success) return <span className="text-xs font-bold text-neutral-500">Anotado</span>;
  return <form action={action}>
    <input type="hidden" name="membershipId" value={membershipId}/>
    <input type="hidden" name="divisionId" value={divisionId}/>
    <SubmitButton className="btn btn-secondary" pendingLabel="Anotando…">Anotar</SubmitButton>
  </form>;
}

export function EnrollMemberPicker({ organizationId, divisionId, alreadyEnrolledIds }: { organizationId: string; divisionId: string; alreadyEnrolledIds: string[] }) {
  const [state, action] = useActionState<MemberSearchState, FormData>(searchMembersForEnroll, { results: [] });
  const [open, setOpen] = useState(false);
  const enrolled = new Set(alreadyEnrolledIds);

  if (!open) return <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>Anotar socio</button>;

  return <div className="card mt-4 p-4">
    <form action={action} className="flex gap-2">
      <input type="hidden" name="organizationId" value={organizationId}/>
      <input className="field" name="query" placeholder="Nombre, DNI o N° de socio…" autoFocus/>
      <button className="btn btn-secondary" type="submit"><Search size={16}/>Buscar</button>
      <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}><X size={16}/></button>
    </form>
    {state.results.length > 0 && <div className="mt-4 grid gap-2">
      {state.results.map((m) => <div key={m.membershipId} className="flex items-center justify-between gap-3 rounded-lg border border-white/[.06] px-3 py-2 text-sm">
        <span>{m.firstName} {m.lastName} · N° {m.memberNumber}</span>
        {enrolled.has(m.membershipId) ? <span className="text-xs font-bold text-neutral-500">Ya está anotado</span> : <EnrollButton membershipId={m.membershipId} divisionId={divisionId}/>}
      </div>)}
    </div>}
  </div>;
}
