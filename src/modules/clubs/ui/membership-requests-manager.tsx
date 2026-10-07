"use client";

import { useActionState, useState } from "react";
import { approveMembershipRequest, rejectMembershipRequest, type ClubActionState } from "../application/actions";
import { membershipRequestStatusLabels, type MembershipRequestRow } from "../domain/club";
import { ActionMessage } from "@/shared/ui/action-message";
import { SubmitButton } from "@/shared/ui/submit-button";

const statusTone: Record<string, string> = { pending: "text-neutral-500", approved: "status-success", rejected: "status-danger" };

function RequestCard({ request, suggestedNumber }: { request: MembershipRequestRow; suggestedNumber?: string }) {
  const [approveState, approveAction] = useActionState<ClubActionState, FormData>(approveMembershipRequest, {});
  const [rejectState, rejectAction] = useActionState<ClubActionState, FormData>(rejectMembershipRequest, {});
  const [reviewing, setReviewing] = useState<"approve" | "reject" | null>(null);

  return <div className="card p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="font-bold">{request.firstName} {request.lastName}</p>
        <p className="mt-0.5 text-xs text-neutral-500">{request.email}{request.phone ? ` · ${request.phone}` : ""}</p>
        <p className="mt-1 text-xs text-neutral-500">Categoría: {request.categoryName ?? "—"}{request.divisionName ? ` · División: ${request.divisionName}` : ""} · {new Date(request.createdAt).toLocaleDateString("es-AR")}</p>
        {request.message && <p className="mt-2 text-sm text-neutral-300">&ldquo;{request.message}&rdquo;</p>}
      </div>
      <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${statusTone[request.status]}`}>{membershipRequestStatusLabels[request.status]}</span>
    </div>

    {request.status === "pending" && <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[.07] pt-4">
      {reviewing !== "reject" && <>
        {reviewing !== "approve" && <>
          <button type="button" className="btn btn-primary" onClick={() => setReviewing("approve")}>Aprobar</button>
          <button type="button" className="btn btn-ghost text-red-400" onClick={() => setReviewing("reject")}>Rechazar</button>
        </>}
        {reviewing === "approve" && <form action={approveAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="requestId" value={request.id}/>
          <label className="label">N° de socio<input className="field" name="memberNumber" defaultValue={suggestedNumber} placeholder="Ej. 0124" required autoFocus/></label>
          <SubmitButton className="btn btn-primary">Confirmar alta</SubmitButton>
          <button type="button" className="btn btn-secondary" onClick={() => setReviewing(null)}>Cancelar</button>
        </form>}
      </>}
      {reviewing === "reject" && <form action={rejectAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="requestId" value={request.id}/>
        <label className="label">Motivo (opcional)<input className="field" name="reason" placeholder="Por qué se rechaza"/></label>
        <SubmitButton className="btn btn-ghost text-red-400">Confirmar rechazo</SubmitButton>
        <button type="button" className="btn btn-secondary" onClick={() => setReviewing(null)}>Cancelar</button>
      </form>}
      <ActionMessage message={approveState.error ?? rejectState.error}/>
    </div>}
  </div>;
}

export function MembershipRequestsManager({ pending, reviewed, suggestedNumber }: { pending: MembershipRequestRow[]; reviewed: MembershipRequestRow[]; suggestedNumber?: string }) {
  return <div className="mt-6 grid gap-6">
    <section>
      <h2 className="text-sm font-bold text-neutral-400">Pendientes {pending.length > 0 && `(${pending.length})`}</h2>
      <div className="mt-3 grid gap-3">
        {pending.map((request) => <RequestCard key={request.id} request={request} suggestedNumber={suggestedNumber}/>)}
        {!pending.length && <p className="text-sm text-neutral-500">No hay solicitudes pendientes.</p>}
      </div>
    </section>
    {reviewed.length > 0 && <section>
      <h2 className="text-sm font-bold text-neutral-400">Revisadas</h2>
      <div className="mt-3 grid gap-3">{reviewed.map((request) => <RequestCard key={request.id} request={request}/>)}</div>
    </section>}
  </div>;
}
