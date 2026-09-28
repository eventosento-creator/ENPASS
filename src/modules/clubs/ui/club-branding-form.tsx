"use client";

import { useActionState } from "react";
import { updateClubBranding, type ClubActionState } from "../application/actions";
import { ActionMessage } from "@/shared/ui/action-message";
import { SubmitButton } from "@/shared/ui/submit-button";

export function ClubBrandingForm({ organizationId, logoUrl, name, accentColor }: {
  organizationId: string; logoUrl: string | null; name: string | null; accentColor: string | null;
}) {
  const [state, action] = useActionState<ClubActionState, FormData>(updateClubBranding, {});
  return <form action={action} className="grid gap-4">
    <input type="hidden" name="organizationId" value={organizationId}/>
    <div className="flex items-center gap-4">
      {logoUrl ? <img src={logoUrl} alt="Logo del club" className="size-14 rounded-xl border border-white/[.08] object-contain bg-white p-1"/> : <div className="grid size-14 place-items-center rounded-xl border border-dashed border-white/[.15] text-[10px] text-neutral-500">Sin logo</div>}
      <label className="btn btn-secondary cursor-pointer"><span>{logoUrl ? "Cambiar logo" : "Subir logo"}</span><input className="sr-only" name="logo" type="file" accept="image/jpeg,image/png,image/webp"/></label>
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="label">Nombre para el remitente del mail<input className="field" name="name" defaultValue={name ?? ""} placeholder="Club Demo" maxLength={60}/></label>
      <label className="label">Color de acento<input className="field h-11 cursor-pointer p-1" name="accentColor" type="color" defaultValue={accentColor ?? "#0a0a0b"}/></label>
    </div>
    <p className="text-xs text-neutral-500">Se usa en los mails de socios (bienvenida, cuota, pago). El dominio de envío sigue siendo el de ENPASS.</p>
    <ActionMessage message={state.error}/><ActionMessage message={state.success} tone="success"/>
    <SubmitButton className="btn btn-primary w-fit">Guardar identidad</SubmitButton>
  </form>;
}
