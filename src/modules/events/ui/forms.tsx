"use client";

import { useActionState, useEffect, useState } from "react";
import { createEvent, createTicketType, replaceEventCover, updateTicketType } from "../application/actions";
import { ActionMessage } from "@/shared/ui/action-message";
import { SubmitButton } from "@/shared/ui/submit-button";
import type { TicketType, Venue } from "@/shared/database/types";

export function EventForm({ organizationId, venues }: { organizationId: string; venues: Venue[] }) {
  const [state, action] = useActionState(createEvent, {});
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  function previewFile(file?: File) { if (preview) URL.revokeObjectURL(preview); setPreview(file ? URL.createObjectURL(file) : null); }
  return <form action={action} className="mt-8 grid gap-6 md:grid-cols-[240px_1fr] md:items-start">
    <input type="hidden" name="organizationId" value={organizationId}/>
    <label className="group relative mx-auto aspect-[4/3] w-full max-w-sm cursor-pointer overflow-hidden rounded-[1.4rem] border border-dashed border-white/15 bg-[#111114] md:sticky md:top-6 md:aspect-[4/5]">
      {preview ? <div role="img" aria-label="Vista previa del flyer" className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url("${preview}")` }}/> : <div className="grid h-full place-items-center p-6 text-center"><div><span className="text-3xl">✦</span><p className="mt-3 font-bold">Subí el flyer</p><p className="mt-1 text-xs text-neutral-500">JPG, PNG o WebP · hasta 5 MB</p></div></div>}
      <span className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/75 px-4 py-2 text-xs font-bold backdrop-blur">{preview ? "Cambiar imagen" : "Elegir imagen"}</span>
      <input className="sr-only" name="cover" type="file" accept="image/jpeg,image/png,image/webp" onChange={event => previewFile(event.target.files?.[0])}/>
    </label>
    <div className="surface grid gap-5 p-5 sm:p-7">
      <label className="label">Nombre<input className="field text-lg font-bold" name="name" placeholder="Noche 2000" required autoFocus/></label>
      <label className="label">Lugar<select className="field" name="venueId" required defaultValue=""><option value="" disabled>Elegí un lugar</option>{venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
      <label className="label">Fecha y hora<input className="field" name="startsAt" type="datetime-local" required/></label>
      <details className="rounded-xl border border-white/[.07] p-4"><summary className="cursor-pointer text-sm font-bold text-neutral-400">Opciones del evento</summary><div className="mt-4 grid gap-4"><label className="label">Capacidad personalizada <span className="font-normal text-neutral-600">(opcional)</span><input className="field" name="capacity" type="number" min="1" placeholder="Usar capacidad del lugar"/></label><label className="label">Descripción <span className="font-normal text-neutral-600">(opcional)</span><textarea className="field min-h-24 resize-y" name="description" placeholder="Contá en pocas palabras qué hace especial esta fecha."/></label><label className="flex items-center gap-3 text-sm text-neutral-400"><input type="checkbox" name="requireDocument" value="true"/> Solicitar DNI en el checkout</label></div></details>
    </div>
    <div className="md:col-start-2"><ActionMessage message={state.error}/></div><SubmitButton className="btn btn-primary min-h-14 md:col-start-2">Continuar a entradas</SubmitButton>
  </form>;
}

export function TicketTypeForm({ organizationId, eventId }: { organizationId: string; eventId: string }) {
  const [state, action] = useActionState(createTicketType, {});
  return <form action={action} className="grid gap-4 rounded-2xl border border-dashed border-neutral-700 p-4">
    <input type="hidden" name="organizationId" value={organizationId}/><input type="hidden" name="eventId" value={eventId}/>
    <div className="grid gap-4 sm:grid-cols-2"><label className="label">Etapa de venta<input className="field" name="phaseName" placeholder="Preventa 1" required/></label><label className="label">Nombre de entrada<input className="field" name="name" placeholder="General" required/></label></div>
    <label className="label">Precio en ARS<input className="field" name="pricePesos" type="number" min="0" step="1" inputMode="numeric" required/></label>
    <div className="grid gap-4 sm:grid-cols-2"><label className="label">Cantidad<input className="field" name="quantity" type="number" min="1" required/></label><label className="label">Máximo por compra<input className="field" name="maxPerOrder" type="number" min="1" max="20" defaultValue="6" required/></label></div>
    <ActionMessage message={state.error}/><SubmitButton className="btn btn-secondary">Agregar entrada</SubmitButton>
  </form>;
}

export function TicketTypeEditForm({ organizationId, eventId, ticketType }: { organizationId: string; eventId: string; ticketType: TicketType }) {
  const [state, action] = useActionState(updateTicketType, {});
  return <form action={action} className="mt-5 grid gap-4">
    <input type="hidden" name="organizationId" value={organizationId}/><input type="hidden" name="eventId" value={eventId}/><input type="hidden" name="ticketTypeId" value={ticketType.id}/>
    <label className="label">Nombre<input className="field" name="name" defaultValue={ticketType.name} required/></label>
    <div className="grid grid-cols-2 gap-3"><label className="label">Precio en ARS<input className="field" name="pricePesos" type="number" min="0" step="1" defaultValue={ticketType.price_amount / 100} required/></label><label className="label">Cantidad<input className="field" name="quantity" type="number" min="1" defaultValue={ticketType.quantity} required/></label></div>
    <label className="label">Máximo por compra<input className="field" name="maxPerOrder" type="number" min="1" max="20" defaultValue={ticketType.max_per_order} required/></label>
    <ActionMessage message={state.error}/><SubmitButton className="btn btn-secondary">Guardar cambios</SubmitButton>
  </form>;
}

export function EventCoverUpload({ organizationId, eventId }: { organizationId: string; eventId: string }) {
  const [state, action] = useActionState(replaceEventCover, {});
  const [selected, setSelected] = useState(false);
  return <form action={action} className="flex flex-wrap gap-2"><input type="hidden" name="organizationId" value={organizationId}/><input type="hidden" name="eventId" value={eventId}/><label className="btn btn-ghost cursor-pointer"><span>Cambiar flyer</span><input className="sr-only" name="cover" type="file" accept="image/jpeg,image/png,image/webp" required onChange={(event) => setSelected(Boolean(event.target.files?.length))}/></label>{selected && <SubmitButton className="btn btn-secondary">Guardar flyer</SubmitButton>}<ActionMessage message={state.error}/></form>;
}
