"use client";

import { useActionState, useState } from "react";
import { CopyPlus, X } from "lucide-react";
import { duplicateEvent } from "../application/actions";
import { SubmitButton } from "@/shared/ui/submit-button";
import { ActionMessage } from "@/shared/ui/action-message";

export function DuplicateEventForm({ eventId, eventName, timezone, defaultStartsAt }: { eventId: string; eventName: string; timezone: string; defaultStartsAt: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(duplicateEvent, {});
  return <>
    <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}><CopyPlus size={17}/>Duplicar</button>
    {open && <div className="fixed inset-0 z-50 flex items-end bg-black/70 backdrop-blur-sm sm:items-center sm:justify-center" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}><section className="w-full rounded-t-[1.5rem] border border-white/10 bg-[var(--surface)] p-5 sm:max-w-lg sm:rounded-[1.5rem] sm:p-7" role="dialog" aria-modal="true" aria-label="Duplicar evento"><div className="flex items-start justify-between gap-4"><div><p className="eyebrow">Nueva fecha</p><h2 className="mt-2 text-2xl font-black">Duplicar evento</h2></div><button type="button" aria-label="Cerrar" className="btn btn-ghost btn-icon min-h-11" onClick={() => setOpen(false)}><X size={18}/></button></div><form action={action} className="mt-6 grid gap-4"><input type="hidden" name="eventId" value={eventId}/><input type="hidden" name="timezone" value={timezone}/><label className="label">Nombre<input className="field" name="name" defaultValue={`${eventName} — nueva fecha`} required/></label><label className="label">Fecha y hora<input className="field" name="startsAt" type="datetime-local" defaultValue={defaultStartsAt} required/></label><label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 p-4"><input className="mt-1 size-4 accent-[var(--accent)]" name="preservePromoters" type="checkbox" defaultChecked/><span><strong className="text-sm">Conservar RRPP</strong><span className="mt-1 block text-xs leading-5 text-neutral-500">Copia Promoters, links y reglas. No copia actividad.</span></span></label><label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 p-4"><input className="mt-1 size-4 accent-[var(--accent)]" name="preserveTables" type="checkbox" defaultChecked/><span><strong className="text-sm">Conservar mesas</strong><span className="mt-1 block text-xs leading-5 text-neutral-500">Copia sectores, precios, capacidades y beneficios. Todas comienzan disponibles.</span></span></label><ActionMessage message={state.error}/><SubmitButton className="btn btn-primary min-h-14"><CopyPlus size={17}/>Crear borrador</SubmitButton></form></section></div>}
  </>;
}
