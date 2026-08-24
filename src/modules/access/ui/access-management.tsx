"use client";

import { useActionState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { createAccessGate, createScannerAuthorization, updateAccessGate, type AccessActionState } from "../application/actions";
import type { AccessGate, AccessGateTicketType, TicketType } from "@/shared/database/types";
import { SubmitButton } from "@/shared/ui/submit-button";

const initialState: AccessActionState = {};

export function CreateGateForm({ eventId, ticketTypes }: { eventId: string; ticketTypes: TicketType[] }) {
  const [state, action] = useActionState(createAccessGate, initialState);
  return <form action={action} className="card grid gap-4 p-5">
    <div><p className="eyebrow">Nueva puerta</p><h3 className="mt-2 text-xl font-black">Definir acceso</h3></div>
    <input type="hidden" name="eventId" value={eventId}/>
    <label className="label">Nombre<input className="field" name="name" placeholder="Acceso principal" required minLength={2}/></label>
    <label className="label">Descripción<input className="field" name="description" placeholder="Ubicación o referencia"/></label>
    <TicketTypeChecks ticketTypes={ticketTypes} selected={new Set()}/>
    <Message state={state}/><SubmitButton className="btn btn-primary w-full" pendingLabel="Creando…">Crear puerta</SubmitButton>
  </form>;
}

export function GateEditor({ gate, rules, ticketTypes }: { gate: AccessGate; rules: AccessGateTicketType[]; ticketTypes: TicketType[] }) {
  const [state, action] = useActionState(updateAccessGate, initialState);
  const selected = new Set(rules.filter((rule) => rule.access_gate_id === gate.id).map((rule) => rule.ticket_type_id));
  return <form action={action} className="card grid gap-4 p-5">
    <input type="hidden" name="eventId" value={gate.event_id}/><input type="hidden" name="gateId" value={gate.id}/>
    <div className="flex items-start justify-between gap-3"><div><p className="text-lg font-black">{gate.name}</p><p className="mt-1 text-xs text-neutral-500">{gate.active ? "Operativa" : "Desactivada"}</p></div><label className="flex items-center gap-2 text-xs font-bold text-neutral-400"><input type="checkbox" name="active" defaultChecked={gate.active}/> Activa</label></div>
    <label className="label">Nombre<input className="field" name="name" defaultValue={gate.name} required/></label>
    <label className="label">Descripción<input className="field" name="description" defaultValue={gate.description}/></label>
    <TicketTypeChecks ticketTypes={ticketTypes} selected={selected}/>
    <Message state={state}/><SubmitButton className="btn btn-secondary w-full" pendingLabel="Guardando…">Guardar reglas</SubmitButton>
  </form>;
}

export function DeviceAuthorizationForm({ eventId, gates }: { eventId: string; gates: AccessGate[] }) {
  const [state, action] = useActionState(createScannerAuthorization, initialState);
  return <form action={action} className="card grid gap-4 p-5">
    <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]"><KeyRound size={19}/></span><div><p className="font-black">Autorizar dispositivo</p><p className="text-xs text-neutral-500">PIN único · vence en 30 minutos</p></div></div>
    <input type="hidden" name="eventId" value={eventId}/>
    <label className="label">Puerta<select className="field" name="gateId" required defaultValue=""><option value="" disabled>Elegí una puerta</option>{gates.filter((gate) => gate.active).map((gate) => <option value={gate.id} key={gate.id}>{gate.name}</option>)}</select></label>
    <label className="label">Nombre del dispositivo<input className="field" name="label" placeholder="Scanner puerta 2" required/></label>
    <label className="label">Permiso<select className="field" name="permission" defaultValue="scanner"><option value="scanner">Scanner</option><option value="supervisor">Supervisor</option></select></label>
    {state.pin && <div className="rounded-2xl border border-lime-400/40 bg-lime-400/10 p-5 text-center"><p className="text-xs font-black uppercase tracking-[.2em] text-lime-300">PIN de activación</p><p className="mt-2 font-mono text-4xl font-black tracking-[.2em]">{state.pin}</p><p className="mt-2 text-xs text-lime-100/70">Se muestra una sola vez.</p></div>}
    <Message state={state}/><SubmitButton className="btn btn-primary w-full" pendingLabel="Generando…"><ShieldCheck size={17}/>Generar PIN</SubmitButton>
  </form>;
}

function TicketTypeChecks({ ticketTypes, selected }: { ticketTypes: TicketType[]; selected: Set<string> }) {
  return <fieldset><legend className="text-sm font-semibold text-neutral-300">Entradas aceptadas</legend><div className="mt-2 grid gap-2">{ticketTypes.map((type) => <label key={type.id} className="flex min-h-11 items-center gap-3 rounded-xl border border-white/[.08] bg-black/20 px-3 text-sm text-neutral-300"><input type="checkbox" name="ticketTypeIds" value={type.id} defaultChecked={selected.has(type.id)}/><span>{type.name}</span></label>)}</div></fieldset>;
}

function Message({ state }: { state: AccessActionState }) {
  if (state.error) return <p className="text-sm font-semibold text-red-300">{state.error}</p>;
  if (state.success && !state.pin) return <p className="text-sm font-semibold text-lime-300">{state.success}</p>;
  return null;
}
