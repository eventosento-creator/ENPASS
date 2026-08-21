"use client";

import { useActionState, useState } from "react";
import { MapPin, Plus, X } from "lucide-react";
import { createOrganization, createVenue } from "../application/actions";
import { ActionMessage } from "@/shared/ui/action-message";
import { SubmitButton } from "@/shared/ui/submit-button";
import { EmptyState } from "@/shared/ui/empty-state";
import type { Venue } from "@/shared/database/types";

export function OrganizationForm({ nextPath = "/app" }: { nextPath?: string }) {
  const [state, action] = useActionState(createOrganization, {});
  return <form action={action} className="card mt-7 grid gap-5 p-5 sm:p-7"><input type="hidden" name="next" value={nextPath}/><label className="label">Nombre de la organización<input className="field" name="name" placeholder="Club XYZ" required/></label><ActionMessage message={state.error}/><SubmitButton>Crear organización</SubmitButton></form>;
}

export function VenueForm({ organizationId, compact = false, nextPath = "/app" }: { organizationId: string; compact?: boolean; nextPath?: string }) {
  const [state, action] = useActionState(createVenue, {});
  return <form action={action} className={compact ? "grid gap-4" : "card mt-7 grid gap-4 p-5 sm:p-7"}>
    <input type="hidden" name="organizationId" value={organizationId}/>
    <input type="hidden" name="next" value={nextPath}/>
    <label className="label">Nombre<input className="field" name="name" placeholder="Club Central" required/></label>
    <label className="label">Dirección<input className="field" name="address" placeholder="Av. España 2110" required/></label>
    <div className="grid gap-4 sm:grid-cols-2"><label className="label">Ciudad<input className="field" name="city" defaultValue="Mendoza" required/></label><label className="label">Provincia<input className="field" name="province" defaultValue="Mendoza" required/></label></div>
    <label className="label">Capacidad<input className="field" name="capacity" type="number" min="1" inputMode="numeric" required/></label>
    <details className="rounded-xl border border-white/[.07] p-4"><summary className="cursor-pointer text-sm font-semibold text-neutral-500">Configuración avanzada</summary><label className="label mt-4">Zona horaria<select className="field" name="timezone" defaultValue="America/Argentina/Mendoza"><option>America/Argentina/Mendoza</option><option>America/Argentina/Buenos_Aires</option><option>America/Argentina/Cordoba</option></select></label></details>
    <ActionMessage message={state.error}/><SubmitButton>Guardar lugar</SubmitButton>
  </form>;
}

export function VenueManager({ organizationId, venues }: { organizationId: string; venues: Venue[] }) {
  const [creating, setCreating] = useState(false);
  return <><div className="flex items-end justify-between gap-4"><div><p className="eyebrow">Configuración</p><h1 className="page-title mt-2">Lugares</h1><p className="mt-3 text-neutral-500">Los espacios donde ocurren tus fechas.</p></div><button aria-label="Nuevo lugar" className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={18}/><span className="hidden sm:inline">Nuevo lugar</span></button></div>
    <div className="mt-8">{venues.length ? <div className="grid gap-4 sm:grid-cols-2">{venues.map(venue => <article className="card p-5 sm:p-6" key={venue.id}><div className="grid size-10 place-items-center rounded-xl bg-white/[.06]"><MapPin size={19} className="text-white/60"/></div><h2 className="mt-5 text-xl font-bold">{venue.name}</h2><p className="mt-2 text-sm leading-6 text-neutral-500">{venue.address}<br/>{venue.city}, {venue.province}</p><p className="mt-5 border-t border-white/[.07] pt-4 text-sm text-neutral-400">Hasta <strong className="text-white">{venue.capacity}</strong> personas</p></article>)}</div> : <EmptyState icon={MapPin} title="Todavía no hay lugares" description="Guardá tu primer club o venue para crear una fecha." action={<button className="btn btn-primary" onClick={() => setCreating(true)}>Crear lugar</button>}/>}</div>
    {creating && <div className="fixed inset-0 z-50 bg-black/70 p-3 backdrop-blur-sm sm:grid sm:place-items-center" role="dialog" aria-modal="true" aria-label="Nuevo lugar"><div className="ml-auto h-full w-full max-w-xl overflow-y-auto rounded-[1.4rem] border border-white/10 bg-[#111113] p-5 shadow-2xl sm:mx-auto sm:h-auto sm:max-h-[90vh] sm:p-7"><div className="mb-6 flex items-center justify-between"><div><p className="eyebrow">Nuevo lugar</p><h2 className="mt-2 text-2xl font-black">¿Dónde ocurre?</h2></div><button className="grid size-10 place-items-center rounded-full bg-white/[.06]" onClick={() => setCreating(false)} aria-label="Cerrar"><X size={18}/></button></div><VenueForm organizationId={organizationId} compact/></div></div>}
  </>;
}
