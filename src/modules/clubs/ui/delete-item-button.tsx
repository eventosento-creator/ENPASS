"use client";

import { useActionState } from "react";
import { Trash2 } from "lucide-react";
import type { ClubActionState } from "../application/actions";
import { ActionMessage } from "@/shared/ui/action-message";

/** Botón de borrar con confirmación. El mensaje de error (ej. "tiene socios") se muestra debajo. */
export function DeleteItemButton({ action, organizationId, id, name, kind }: { action: (state: ClubActionState, formData: FormData) => Promise<ClubActionState>; organizationId: string; id: string; name: string; kind: "categoría" | "división" }) {
  const [state, formAction, pending] = useActionState<ClubActionState, FormData>(action, {});
  return <form action={formAction} onSubmit={(event) => { if (!confirm(`¿Borrar la ${kind} "${name}"? Esta acción no se puede deshacer.`)) event.preventDefault(); }} className="grid justify-items-end gap-1">
    <input type="hidden" name="organizationId" value={organizationId}/>
    <input type="hidden" name="id" value={id}/>
    <button className="btn btn-ghost text-red-500" type="submit" disabled={pending} aria-label={`Borrar ${kind} ${name}`}><Trash2 size={15}/></button>
    <ActionMessage message={state.error}/>
  </form>;
}
