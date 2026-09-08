"use client";

import { useActionState, useEffect, useState } from "react";
import { Armchair, CalendarDays, DoorOpen, Grid3x3, MapPin, Music2, Presentation, Shield, ShoppingCart, Sparkles, Ticket, Trophy, UsersRound } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { createEvent, createTicketType, replaceEventCover, updateEvent, updateEventConfiguration, updateTicketType } from "../application/actions";
import { ActionMessage } from "@/shared/ui/action-message";
import { SubmitButton } from "@/shared/ui/submit-button";
import type { Event, TicketType, Venue } from "@/shared/database/types";
import { EVENT_PROFILE_OPTIONS, getDefaultCapabilitiesForProfile, getEventProfileLabel, type EventCapabilities, type EventProfile, type VisibleEventCapability } from "../domain/event-profile";

export function EventForm({ organizationId, venues, initialProfile }: { organizationId: string; venues: Venue[]; initialProfile?: string }) {
  const [state, action] = useActionState(createEvent, {});
  const [preview, setPreview] = useState<string | null>(null);
  const validInitialProfile = EVENT_PROFILE_OPTIONS.some((option) => option.value === initialProfile) ? initialProfile as EventProfile : null;
  const [profile, setProfile] = useState<EventProfile | null>(validInitialProfile);
  const [capabilities, setCapabilities] = useState<EventCapabilities>(() => getDefaultCapabilitiesForProfile(validInitialProfile ?? "nightlife"));
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  function previewFile(file?: File) { if (preview) URL.revokeObjectURL(preview); setPreview(file ? URL.createObjectURL(file) : null); }
  function selectProfile(nextProfile: EventProfile) {
    setProfile(nextProfile);
    setCapabilities(getDefaultCapabilitiesForProfile(nextProfile));
  }
  if (!profile) return <section className="mt-8">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{EVENT_PROFILE_OPTIONS.map((option, index) => {
      const Icon = profileIcons[index]!;
      return <button type="button" key={option.value} onClick={() => selectProfile(option.value)} className="card card-interactive min-h-40 p-5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">
        <Icon size={22} className="text-[var(--accent)]"/><strong className="mt-8 block text-lg font-black">{option.label}</strong><span className="mt-2 block text-sm leading-5 text-neutral-500">{option.description}</span>
      </button>;
    })}</div>
  </section>;
  if (!venues.length) return <section className="mt-8 card p-7 text-center sm:p-10">
    <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[var(--accent)] text-[var(--on-accent)]"><MapPin size={24}/></div>
    <div className="mt-6 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider text-neutral-600"><span>{getEventProfileLabel(profile)}</span><button type="button" className="underline hover:text-white" onClick={() => setProfile(null)}>Cambiar</button></div>
    <h2 className="mt-3 text-2xl font-black">Ahora, ¿dónde es?</h2>
    <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-neutral-500">Todavía no tenés lugares cargados. La capacidad y zona horaria del venue protegen la venta.</p>
    <a className="btn btn-primary mt-6" href={`/app/venues?next=${encodeURIComponent(`/app/events/new?profile=${profile}`)}`}>Crear lugar</a>
  </section>;
  return <form action={action} className="mt-8 grid gap-6 md:grid-cols-[240px_1fr] md:items-start">
    <input type="hidden" name="organizationId" value={organizationId}/>
    <input type="hidden" name="profile" value={profile}/>
    <input type="hidden" name="ticketsEnabled" value={String(capabilities.tickets)}/>
    <input type="hidden" name="promotersEnabled" value={String(capabilities.promoters)}/>
    <input type="hidden" name="tablesEnabled" value={String(capabilities.tables)}/>
    <input type="hidden" name="seatmapEnabled" value={String(capabilities.seatmap)}/>
    <input type="hidden" name="accessEnabled" value={String(capabilities.access)}/>
    <input type="hidden" name="posEnabled" value={String(capabilities.pos)}/>
    <label className="group relative mx-auto aspect-[4/3] w-full max-w-sm cursor-pointer overflow-hidden rounded-[1.4rem] border border-dashed border-white/15 bg-[var(--surface)] md:sticky md:top-6 md:aspect-[4/5]">
      {preview ? <div role="img" aria-label="Vista previa del flyer" className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url("${preview}")` }}/> : <div className="grid h-full place-items-center p-6 text-center"><div><span className="text-3xl">✦</span><p className="mt-3 font-bold">Subí el flyer</p><p className="mt-1 text-xs text-neutral-500">JPG, PNG o WebP · hasta 5 MB</p></div></div>}
      <span className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/75 px-4 py-2 text-xs font-bold backdrop-blur">{preview ? "Cambiar imagen" : "Elegir imagen"}</span>
      <input className="sr-only" name="cover" type="file" accept="image/jpeg,image/png,image/webp" onChange={event => previewFile(event.target.files?.[0])}/>
    </label>
    <div className="surface grid gap-5 p-5 sm:p-7">
      <div className="flex items-center justify-between gap-4 rounded-xl border border-white/[.07] p-4"><div><span className="text-xs font-bold uppercase tracking-wider text-neutral-600">Tipo de evento</span><p className="mt-1 font-black">{getEventProfileLabel(profile)}</p></div><button className="btn btn-ghost min-h-10 px-3 text-xs" type="button" onClick={() => setProfile(null)}>Cambiar</button></div>
      {profile === "other" && <div><p className="label">¿Qué necesitás gestionar?</p><div className="mt-3 grid grid-cols-2 gap-2">{visibleCapabilities.map((capability) => <CapabilityButton key={capability} capability={capability} active={capabilities[capability]} onToggle={() => setCapabilities((current) => ({ ...current, [capability]: !current[capability] }))}/>)}</div></div>}
      <label className="label">Nombre<input className="field text-lg font-bold" name="name" placeholder="Noche 2000" required autoFocus/></label>
      <label className="label">Lugar<select className="field" name="venueId" required defaultValue=""><option value="" disabled>Elegí un lugar</option>{venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="label">Inicio<input className="field" name="startsAt" type="datetime-local" required/></label>
        <label className="label">Fin <span className="font-normal text-neutral-600">(opcional)</span><input className="field" name="endsAt" type="datetime-local"/></label>
      </div>
      <details className="rounded-xl border border-white/[.07] p-4"><summary className="cursor-pointer text-sm font-bold text-neutral-400">Opciones del evento</summary><div className="mt-4 grid gap-4"><label className="label">Capacidad personalizada <span className="font-normal text-neutral-600">(opcional)</span><input className="field" name="capacity" type="number" min="1" placeholder="Usar capacidad del lugar"/></label><label className="label">Descripción <span className="font-normal text-neutral-600">(opcional)</span><textarea className="field min-h-24 resize-y" name="description" placeholder="Contá en pocas palabras qué hace especial esta fecha."/></label><label className="flex items-center gap-3 text-sm text-neutral-400"><input type="checkbox" name="requireDocument" value="true"/> Solicitar DNI en el checkout</label></div></details>
    </div>
    <div className="md:col-start-2"><ActionMessage message={state.error}/></div><SubmitButton className="btn btn-primary min-h-14 md:col-start-2">Continuar a entradas</SubmitButton>
  </form>;
}

export function EventFunctionsForm({ event, hasData }: { event: Event; hasData: Partial<Record<VisibleEventCapability, boolean>> }) {
  const [state, action] = useActionState(updateEventConfiguration, {});
  const [profile, setProfile] = useState<EventProfile>(event.profile);
  const [capabilities, setCapabilities] = useState<Record<VisibleEventCapability, boolean>>({
    tickets: event.tickets_enabled, promoters: event.promoters_enabled,
    tables: event.tables_enabled, seatmap: event.seatmap_enabled,
    access: event.access_enabled, pos: event.pos_enabled,
  });
  function submit(eventSubmit: React.FormEvent<HTMLFormElement>) {
    const disabledWithHistory = visibleCapabilities.filter((capability) => hasData[capability] && !capabilities[capability]);
    if (disabledWithHistory.length && !window.confirm("Los datos y ventas existentes no se eliminarán. Estas funciones solo dejarán de estar activas. ¿Querés continuar?")) eventSubmit.preventDefault();
  }
  return <form action={action} onSubmit={submit} className="surface mt-8 grid gap-6 p-5 sm:p-7">
    <input type="hidden" name="eventId" value={event.id}/>
    <input type="hidden" name="ticketsEnabled" value={String(capabilities.tickets)}/><input type="hidden" name="promotersEnabled" value={String(capabilities.promoters)}/><input type="hidden" name="tablesEnabled" value={String(capabilities.tables)}/><input type="hidden" name="seatmapEnabled" value={String(capabilities.seatmap)}/><input type="hidden" name="accessEnabled" value={String(capabilities.access)}/><input type="hidden" name="posEnabled" value={String(capabilities.pos)}/>
    <div><label className="label">Tipo de evento<select className="field" name="profile" value={profile} onChange={(change) => setProfile(change.target.value as EventProfile)}>{EVENT_PROFILE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><p className="mt-2 text-xs leading-5 text-neutral-600">Cambiar el tipo no modifica automáticamente las funciones elegidas.</p></div>
    <div><p className="label">Funciones del evento</p><p className="mt-2 text-sm text-neutral-500">Activá únicamente las herramientas que necesitás para esta fecha.</p><div className="mt-4 grid grid-cols-2 gap-2">{visibleCapabilities.map((capability) => <CapabilityButton key={capability} capability={capability} active={capabilities[capability]} onToggle={() => setCapabilities((current) => ({ ...current, [capability]: !current[capability] }))}/>)}</div></div>
    <p className="rounded-xl border border-white/[.07] bg-white/[.025] p-4 text-xs leading-5 text-neutral-500">Al desactivar una función conservamos su configuración, operaciones y métricas históricas. Podés volver a activarla cuando quieras.</p>
    <ActionMessage message={state.error}/><ActionMessage message={state.success} tone="success"/><SubmitButton className="btn btn-primary min-h-14">Guardar funciones</SubmitButton>
  </form>;
}

const visibleCapabilities = ["tickets", "promoters", "tables", "seatmap", "access", "pos"] as const;
const capabilityLabels: Record<VisibleEventCapability, { label: string; icon: typeof Ticket }> = {
  tickets: { label: "Entradas", icon: Ticket }, promoters: { label: "RRPP", icon: UsersRound },
  tables: { label: "Mesas", icon: Armchair }, seatmap: { label: "Asientos", icon: Grid3x3 },
  access: { label: "Control de acceso", icon: DoorOpen },
  pos: { label: "Punto de venta", icon: ShoppingCart },
};
const profileIcons = [Sparkles, Music2, CalendarDays, Presentation, Trophy, Shield, UsersRound, Sparkles] as const;

function CapabilityButton({ capability, active, onToggle }: { capability: VisibleEventCapability; active: boolean; onToggle: () => void }) {
  const { label, icon: Icon } = capabilityLabels[capability];
  return <button type="button" aria-pressed={active} onClick={onToggle} className={`min-h-20 rounded-xl border p-3 text-left transition ${active ? "border-[var(--accent)]/50 bg-[var(--accent)]/[.07] text-white" : "border-white/[.07] text-neutral-500"}`}><Icon size={17}/><span className="mt-3 flex items-center justify-between gap-2 text-sm font-bold"><span>{label}</span><span className="text-[10px] uppercase">{active ? "ON" : "OFF"}</span></span></button>;
}

export function EventEditForm({ event, venues, timezone }: { event: Event; venues: Venue[]; timezone: string }) {
  const [state, action] = useActionState(updateEvent, {});
  const localValue = (value: string | null) => value ? formatInTimeZone(value, timezone, "yyyy-MM-dd'T'HH:mm") : "";
  return <form action={action} className="mt-8 grid gap-6">
    <input type="hidden" name="eventId" value={event.id}/>
    <div className="surface grid gap-5 p-5 sm:p-7">
      <label className="label">Nombre<input className="field text-lg font-bold" name="name" defaultValue={event.name} required autoFocus/></label>
      <label className="label">Lugar<select className="field" name="venueId" required defaultValue={event.venue_id}>{venues.map(venue => <option key={venue.id} value={venue.id}>{venue.name}</option>)}</select></label>
      <label className="label">Descripción <span className="font-normal text-neutral-600">(opcional)</span><textarea className="field min-h-28 resize-y" name="description" defaultValue={event.description} placeholder="Contá en pocas palabras qué hace especial esta fecha."/></label>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="label">Inicio del evento<input className="field" name="startsAt" type="datetime-local" defaultValue={localValue(event.starts_at)} required/></label>
        <label className="label">Apertura de puertas <span className="font-normal text-neutral-600">(opcional)</span><input className="field" name="doorsOpenAt" type="datetime-local" defaultValue={localValue(event.doors_open_at)}/></label>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="label">Cierre <span className="font-normal text-neutral-600">(opcional)</span><input className="field" name="endsAt" type="datetime-local" defaultValue={localValue(event.ends_at)}/></label>
        <label className="label">Capacidad<input className="field" name="capacity" type="number" min="1" max="100000" defaultValue={event.capacity} required/></label>
      </div>
      <label className="flex min-h-11 items-center gap-3 text-sm text-neutral-300"><input type="checkbox" name="requireDocument" value="true" defaultChecked={event.require_document}/> Solicitar DNI en el checkout</label>
    </div>
    <ActionMessage message={state.error}/><ActionMessage message={state.success} tone="success"/>
    <SubmitButton className="btn btn-primary min-h-14" pendingLabel="Guardando cambios…">Guardar cambios</SubmitButton>
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
