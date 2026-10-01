"use client";

import { useActionState, useState } from "react";
import { updateClubPublicListing, type ClubActionState } from "../application/actions";
import type { ClubListingSettings } from "../domain/club";
import { ActionMessage } from "@/shared/ui/action-message";
import { SubmitButton } from "@/shared/ui/submit-button";

const statusCopy: Record<ClubListingSettings["status"], { label: string; tone: string; note: string }> = {
  none: { label: "No publicado", tone: "text-neutral-500", note: "Tu club no aparece en enpass.com.ar/clubes." },
  pending: { label: "En revisión", tone: "text-amber-400", note: "ENPASS está revisando tu club antes de publicarlo." },
  approved: { label: "Publicado", tone: "status-success", note: "Tu club aparece en enpass.com.ar/clubes." },
  rejected: { label: "Rechazado", tone: "status-danger", note: "ENPASS rechazó la publicación." },
};

export function ClubPublicListingForm({ organizationId, settings }: { organizationId: string; settings: ClubListingSettings }) {
  const [state, action] = useActionState<ClubActionState, FormData>(updateClubPublicListing, {});
  const [wantPublic, setWantPublic] = useState(settings.status === "pending" || settings.status === "approved");
  const copy = statusCopy[settings.status];

  return <form action={action} className="grid gap-4">
    <input type="hidden" name="organizationId" value={organizationId}/>
    <input type="hidden" name="wantPublic" value={wantPublic ? "true" : "false"}/>
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="font-bold">Publicar mi club en ENPASS</p>
        <p className={`mt-0.5 text-xs font-bold ${copy.tone}`}>{copy.label} · <span className="font-normal text-neutral-500">{copy.note}</span></p>
      </div>
      <button type="button" role="switch" aria-checked={wantPublic} onClick={() => setWantPublic((v) => !v)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition ${wantPublic ? "bg-[var(--accent)]" : "bg-white/15"}`}>
        <span className={`absolute top-1 size-5 rounded-full bg-white transition ${wantPublic ? "left-6" : "left-1"}`}/>
      </button>
    </div>
    {settings.status === "rejected" && settings.rejectionReason && <p className="text-xs text-red-400">Motivo: {settings.rejectionReason}</p>}
    {wantPublic && <label className="label">Descripción pública<textarea className="field min-h-24" name="description" maxLength={600} defaultValue={settings.description ?? ""} placeholder="Contá de qué se trata tu club, actividades, horarios…"/></label>}
    <ActionMessage message={state.error}/><ActionMessage message={state.success} tone="success"/>
    <SubmitButton className="btn btn-primary w-fit">Guardar</SubmitButton>
  </form>;
}
