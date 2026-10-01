"use client";

import { useActionState, useState } from "react";
import { MapPin, Pencil, Plus, Trash2, X } from "lucide-react";
import { createOrganization, createVenue, deleteVenue, updateVenue, type DeleteVenueState } from "../application/actions";
import { ActionMessage } from "@/shared/ui/action-message";
import { SubmitButton } from "@/shared/ui/submit-button";
import { EmptyState } from "@/shared/ui/empty-state";
import type { Venue } from "@/shared/database/types";

export function OrganizationForm({ nextPath = "/app", intent }: { nextPath?: string; intent?: "event" | "club" }) {
  const [state, action] = useActionState(createOrganization, {});
  const isClub = intent === "club";
  return <form action={action} className="card mt-7 grid gap-5 p-5 sm:p-7">
    <input type="hidden" name="next" value={nextPath}/>
    {intent && <input type="hidden" name="intent" value={intent}/>}
    <label className="label">{isClub ? "Nombre del club" : "Nombre de la organización"}<input className="field" name="name" placeholder={isClub ? "Club Central" : "Club XYZ"} required/></label>
    <ActionMessage message={state.error}/>
    <SubmitButton>{isClub ? "Crear club" : "Crear organización"}</SubmitButton>
  </form>;
}

export function VenueForm({ organizationId, venue, compact = false, nextPath = "/app" }: { organizationId: string; venue?: Venue; compact?: boolean; nextPath?: string }) {
  const [state, action] = useActionState(venue ? updateVenue : createVenue, {});
  return <form action={action} className={compact ? "grid gap-4" : "card mt-7 grid gap-4 p-5 sm:p-7"}>
    <input type="hidden" name="organizationId" value={organizationId}/>
    {venue && <input type="hidden" name="venueId" value={venue.id}/>}
    <input type="hidden" name="next" value={nextPath}/>
    <label className="label">Nombre<input className="field" name="name" placeholder="Club Central" defaultValue={venue?.name} required/></label>
    <label className="label">Dirección<input className="field" name="address" placeholder="Av. España 2110" defaultValue={venue?.address} required/></label>
    <div className="grid gap-4 sm:grid-cols-2"><label className="label">Ciudad<input className="field" name="city" defaultValue={venue?.city ?? "Mendoza"} required/></label><label className="label">Provincia<input className="field" name="province" defaultValue={venue?.province ?? "Mendoza"} required/></label></div>
    <label className="label">Capacidad<input className="field" name="capacity" type="number" min="1" inputMode="numeric" defaultValue={venue?.capacity} required/></label>
    <details className="rounded-xl border border-white/[.07] p-4"><summary className="cursor-pointer text-sm font-semibold text-neutral-500">Configuración avanzada</summary><label className="label mt-4">Zona horaria<select className="field" name="timezone" defaultValue={venue?.timezone ?? "America/Argentina/Mendoza"}><option>America/Argentina/Mendoza</option><option>America/Argentina/Buenos_Aires</option><option>America/Argentina/Cordoba</option></select></label></details>
    <ActionMessage message={state.error}/><SubmitButton>{venue ? "Guardar cambios" : "Guardar lugar"}</SubmitButton>
  </form>;
}

function DeleteVenueButton({ organizationId, venueId }: { organizationId: string; venueId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, action] = useActionState<DeleteVenueState, FormData>(deleteVenue, {});
  if (!confirming) return <button type="button" aria-label="Borrar lugar" className="btn btn-ghost !text-red-400" onClick={() => setConfirming(true)}><Trash2 size={16}/></button>;
  return <div className="absolute inset-0 z-10 grid place-items-center rounded-[1.4rem] bg-black/85 p-5 text-center backdrop-blur-sm">
    <div>
      <p className="text-sm font-bold">¿Borrar este lugar?</p>
      <ActionMessage message={state.error}/>
      <form action={action} className="mt-4 flex justify-center gap-2">
        <input type="hidden" name="organizationId" value={organizationId}/>
        <input type="hidden" name="venueId" value={venueId}/>
        <SubmitButton className="btn bg-red-500 text-white" pendingLabel="Borrando…">Sí, borrar</SubmitButton>
        <button type="button" className="btn btn-secondary" onClick={() => setConfirming(false)}>Cancelar</button>
      </form>
    </div>
  </div>;
}

export function VenueManager({ organizationId, venues, nextPath }: { organizationId: string; venues: Venue[]; nextPath?: string }) {
  const [creating, setCreating] = useState(Boolean(nextPath));
  const [editing, setEditing] = useState<Venue | null>(null);
  return <>{nextPath && <p className="mb-5 rounded-xl border border-[var(--accent)]/15 bg-[var(--accent)]/[.05] px-4 py-3 text-sm text-neutral-300">Guardá el lugar y volvés directo a terminar tu evento.</p>}
    <div className="flex items-end justify-between gap-4"><div><p className="eyebrow">Configuración</p><h1 className="page-title mt-2">Lugares</h1><p className="mt-3 text-neutral-500">Los espacios donde ocurren tus fechas.</p></div><button aria-label="Nuevo lugar" className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={18}/><span className="hidden sm:inline">Nuevo lugar</span></button></div>
    <div className="mt-8">{venues.length ? <div className="grid gap-4 sm:grid-cols-2">{venues.map(venue => <article className="card relative p-5 sm:p-6" key={venue.id}>
      <div className="flex items-start justify-between gap-3"><div className="grid size-10 place-items-center rounded-xl bg-white/[.06]"><MapPin size={19} className="text-white/60"/></div><div className="flex gap-1"><button type="button" aria-label="Editar lugar" className="btn btn-ghost" onClick={() => setEditing(venue)}><Pencil size={16}/></button><DeleteVenueButton organizationId={organizationId} venueId={venue.id}/></div></div>
      <h2 className="mt-5 text-xl font-bold">{venue.name}</h2><p className="mt-2 text-sm leading-6 text-neutral-500">{venue.address}<br/>{venue.city}, {venue.province}</p><p className="mt-5 border-t border-white/[.07] pt-4 text-sm text-neutral-400">Hasta <strong className="text-white">{venue.capacity}</strong> personas</p>
    </article>)}</div> : <EmptyState icon={MapPin} title="Todavía no hay lugares" description="Guardá tu primer club o venue para crear una fecha." action={<button className="btn btn-primary" onClick={() => setCreating(true)}>Crear lugar</button>}/>}</div>
    {creating && <div className="fixed inset-0 z-50 bg-black/70 p-3 backdrop-blur-sm sm:grid sm:place-items-center" role="dialog" aria-modal="true" aria-label="Nuevo lugar"><div className="ml-auto h-full w-full max-w-xl overflow-y-auto rounded-[1.4rem] border border-white/10 bg-[var(--surface)] p-5 shadow-2xl sm:mx-auto sm:h-auto sm:max-h-[90vh] sm:p-7"><div className="mb-6 flex items-center justify-between"><div><p className="eyebrow">Nuevo lugar</p><h2 className="mt-2 text-2xl font-black">¿Dónde ocurre?</h2></div><button className="grid size-10 place-items-center rounded-full bg-white/[.06]" onClick={() => setCreating(false)} aria-label="Cerrar"><X size={18}/></button></div><VenueForm organizationId={organizationId} nextPath={nextPath} compact/></div></div>}
    {editing && <div className="fixed inset-0 z-50 bg-black/70 p-3 backdrop-blur-sm sm:grid sm:place-items-center" role="dialog" aria-modal="true" aria-label="Editar lugar"><div className="ml-auto h-full w-full max-w-xl overflow-y-auto rounded-[1.4rem] border border-white/10 bg-[var(--surface)] p-5 shadow-2xl sm:mx-auto sm:h-auto sm:max-h-[90vh] sm:p-7"><div className="mb-6 flex items-center justify-between"><div><p className="eyebrow">Editar lugar</p><h2 className="mt-2 text-2xl font-black">{editing.name}</h2></div><button className="grid size-10 place-items-center rounded-full bg-white/[.06]" onClick={() => setEditing(null)} aria-label="Cerrar"><X size={18}/></button></div><VenueForm organizationId={organizationId} venue={editing} nextPath="/app/venues" compact/></div></div>}
  </>;
}
