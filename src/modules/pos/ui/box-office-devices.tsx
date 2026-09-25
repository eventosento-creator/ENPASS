"use client";

import { useActionState } from "react";
import { KeyRound, Plus } from "lucide-react";
import { createPosDevice, createSalesLocation } from "../application/actions";
import { ActionMessage } from "@/shared/ui/action-message";
import { SubmitButton } from "@/shared/ui/submit-button";

type Location = { id: string; name: string };
type Device = { id: string; sales_location_id: string; name: string; status: "pending" | "active" | "revoked"; cashier_label: string | null };

const statusLabels = { pending: "Esperando activación", active: "Activo", revoked: "Revocado" } as const;

export function BoxOfficeDevices({ eventId, locations, devices, cashierOptions, published }: {
  eventId: string; locations: Location[]; devices: Device[]; cashierOptions: Array<{ id: string; label: string }>; published: boolean;
}) {
  const [locationState, locationAction] = useActionState(createSalesLocation, {});
  const [deviceState, deviceAction] = useActionState(createPosDevice, {});
  return <div className="mt-5 grid gap-6 lg:grid-cols-2">
    <div>
      <p className="text-xs font-bold uppercase text-neutral-600">1. Cajas</p>
      <div className="mt-3 divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">{locations.length === 0 && <p className="p-4 text-sm text-neutral-500">Todavía no creaste ninguna caja.</p>}
        {locations.map((location) => <div key={location.id} className="p-4 text-sm"><p className="font-bold">{location.name}</p>
          {devices.filter((device) => device.sales_location_id === location.id).map((device) => <p key={device.id} className="mt-1 text-xs text-neutral-500">{device.name} · {statusLabels[device.status]}{device.cashier_label ? ` · ${device.cashier_label}` : " · sin cajero"}</p>)}</div>)}</div>
      <form action={locationAction} className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]"><input type="hidden" name="eventId" value={eventId}/><input className="field" name="name" placeholder="Caja 01" required minLength={2}/><SubmitButton className="btn btn-secondary" pendingLabel="Creando…"><Plus size={16}/>Crear caja</SubmitButton></form>
      <div className="mt-2"><ActionMessage message={locationState.error}/><ActionMessage message={locationState.success} tone="success"/></div>
    </div>
    <div>
      <p className="text-xs font-bold uppercase text-neutral-600">2. Código de activación</p>
      {!published && <p className="status-danger mt-3 rounded-xl p-3 text-sm font-bold">El evento tiene que estar publicado para generar códigos.</p>}
      <form action={deviceAction} className="mt-3 grid gap-3">
        <input type="hidden" name="eventId" value={eventId}/>
        <label className="label">Caja<select className="field" name="locationId" required defaultValue=""><option value="" disabled>Elegí una caja</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
        <label className="label">Nombre del dispositivo<input className="field" name="name" placeholder="Tablet puerta" required minLength={2}/></label>
        <label className="label">Cajero <span className="font-normal text-neutral-600">(necesario para vender)</span><select className="field" name="cashierUserId" required defaultValue=""><option value="" disabled>Elegí un cajero</option>{cashierOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
        <ActionMessage message={deviceState.error}/><ActionMessage message={deviceState.success} tone="success"/>
        {deviceState.pin && <div className="rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent)]/[.06] p-5 text-center"><p className="text-xs font-black uppercase tracking-widest text-neutral-500">Código de activación</p><p className="mt-3 font-mono text-4xl font-black tracking-[.25em]">{deviceState.pin.slice(0, 3)} {deviceState.pin.slice(3)}</p><p className="mt-3 text-xs text-neutral-500">Ingresalo en enpass.com.ar/pos desde el dispositivo de la caja. Sirve una sola vez y vence en 30 minutos.</p></div>}
        <SubmitButton className="btn btn-primary min-h-12" pendingLabel="Generando…"><KeyRound size={16}/>Generar código</SubmitButton>
      </form>
    </div>
  </div>;
}
