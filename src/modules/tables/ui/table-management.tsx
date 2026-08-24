"use client";

import { useActionState, useState } from "react";
import { Armchair, Check, Plus, UsersRound, X } from "lucide-react";
import { createEventTable, createTableZone, setEventTableActive } from "../application/actions";
import { tableAvailabilityLabel } from "../domain/table";
import type { AccessGate, EventTable, TableEntitlementTemplate, TableZone } from "@/shared/database/types";
import { formatMoney } from "@/shared/lib/format";
import { ActionMessage } from "@/shared/ui/action-message";
import { SubmitButton } from "@/shared/ui/submit-button";

type ManagedTable = EventTable & {
  availability_status: "available" | "held" | "sold";
  benefits: TableEntitlementTemplate[];
};
type DraftBenefit = { id: string; type: "product" | "drink" | "generic"; name: string; quantity: number };

export function TableManagement({ eventId, zones, tables, gates, editable }: { eventId: string; zones: TableZone[]; tables: ManagedTable[]; gates: AccessGate[]; editable: boolean }) {
  const [zoneOpen, setZoneOpen] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  const activeZones = zones.filter((zone) => zone.active);
  return <>
    <div className="flex flex-wrap gap-2">
      <button className="btn btn-secondary" type="button" onClick={() => setZoneOpen(true)} disabled={!editable}><Plus size={17}/>Nuevo sector</button>
      <button className="btn btn-primary" type="button" onClick={() => setTableOpen(true)} disabled={!editable || activeZones.length === 0}><Plus size={17}/>Agregar mesa</button>
    </div>
    {!activeZones.length ? <EmptyState onCreate={() => setZoneOpen(true)} editable={editable}/> : <div className="mt-7 grid gap-8">{activeZones.map((zone) => {
      const zoneTables = tables.filter((table) => table.table_zone_id === zone.id);
      return <section key={zone.id}><div className="flex items-end justify-between gap-4 border-b border-white/[.08] pb-3"><div><p className="eyebrow">Sector</p><h2 className="mt-1 text-2xl font-black tracking-[-.035em]">{zone.name}</h2>{zone.description && <p className="mt-1 text-sm text-neutral-500">{zone.description}</p>}</div><span className="text-xs font-bold text-neutral-600">{zoneTables.length} {zoneTables.length === 1 ? "mesa" : "mesas"}</span></div>
        {zoneTables.length ? <div className="mt-4 grid gap-3 lg:grid-cols-2">{zoneTables.map((table) => <TableCard eventId={eventId} table={table} editable={editable} key={table.id}/>)}</div> : <div className="mt-4 rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-neutral-500">Todavía no hay mesas en este sector.</div>}
      </section>;
    })}</div>}
    {zoneOpen && <ZoneDrawer eventId={eventId} close={() => setZoneOpen(false)}/>}
    {tableOpen && (
      <TableDrawer eventId={eventId} zones={activeZones} gates={gates} close={() => setTableOpen(false)}/>
    )}
  </>;
}

function TableCard({ eventId, table, editable }: { eventId: string; table: ManagedTable; editable: boolean }) {
  const status = tableAvailabilityLabel(table.availability_status, table.active);
  const tone = table.availability_status === "sold" ? "text-red-300" : table.availability_status === "held" ? "text-amber-300" : table.active ? "text-emerald-300" : "text-neutral-500";
  return <article className="card p-5 sm:p-6"><div className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="flex items-start gap-2"><Armchair size={17} className="mt-0.5 shrink-0 text-[var(--accent)]"/><h3 className="text-lg font-black leading-tight">{table.name}</h3></div><p className="mt-3 flex items-center gap-2 text-sm font-semibold text-neutral-400"><UsersRound size={16}/>{table.capacity} personas</p></div><span className={`max-w-[52%] shrink-0 text-right text-[10px] font-black uppercase leading-4 tracking-wider ${tone}`}>{status}</span></div>
    {table.description && <p className="mt-4 text-sm leading-6 text-neutral-500">{table.description}</p>}
    <div className="mt-5 border-t border-white/[.07] pt-4"><p className="text-[10px] font-black uppercase tracking-wider text-neutral-600">Incluye</p><div className="mt-3 grid gap-2 text-sm"><p className="flex items-center gap-2 text-neutral-300"><Check size={14} className="text-[var(--accent)]"/>{table.capacity} accesos</p>{table.benefits.map((benefit) => <p className="flex items-center gap-2 text-neutral-400" key={benefit.id}><Check size={14} className="text-[var(--accent)]"/>{benefit.quantity} {benefit.name.toLowerCase()}</p>)}</div></div>
    <div className="mt-5 flex items-center justify-between gap-4"><p className="text-xl font-black">{formatMoney(table.base_price_amount, table.currency)}</p>{editable && table.availability_status === "available" && <form action={setEventTableActive}><input type="hidden" name="eventId" value={eventId}/><input type="hidden" name="tableId" value={table.id}/><input type="hidden" name="active" value={table.active ? "false" : "true"}/><button className="btn btn-ghost text-xs" type="submit">{table.active ? "Deshabilitar" : "Habilitar"}</button></form>}</div>
  </article>;
}

function ZoneDrawer({ eventId, close }: { eventId: string; close: () => void }) {
  const [state, action] = useActionState(createTableZone, {});
  return <Drawer title="Nuevo sector" eyebrow="Organización" close={close}><form action={action} className="grid gap-4"><input type="hidden" name="eventId" value={eventId}/><label className="label">Nombre<input className="field" name="name" placeholder="VIP" required autoFocus/></label><label className="label">Descripción <span className="text-neutral-600">(opcional)</span><textarea className="field min-h-24 py-3" name="description" placeholder="Sector junto a la cabina"/></label><ActionMessage message={state.error}/><SubmitButton className="btn btn-primary min-h-14">Crear sector</SubmitButton></form></Drawer>;
}

function TableDrawer({ eventId, zones, gates, close }: { eventId: string; zones: TableZone[]; gates: AccessGate[]; close: () => void }) {
  const [state, action] = useActionState(createEventTable, {});
  const [benefits, setBenefits] = useState<DraftBenefit[]>([]);
  const [draftName, setDraftName] = useState("");
  const [draftQuantity, setDraftQuantity] = useState(1);
  const [draftType, setDraftType] = useState<DraftBenefit["type"]>("generic");
  function addBenefit() {
    const name = draftName.trim();
    if (!name || draftQuantity < 1) return;
    setBenefits((items) => [...items, { id: crypto.randomUUID(), type: draftType, name, quantity: draftQuantity }]);
    setDraftName(""); setDraftQuantity(1);
  }
  const serializedBenefits = benefits.map((benefit) => ({ type: benefit.type, name: benefit.name, quantity: benefit.quantity }));
  return <Drawer title="Nueva mesa" eyebrow="Inventario" close={close}><form action={action} className="grid gap-5"><input type="hidden" name="eventId" value={eventId}/><input type="hidden" name="benefits" value={JSON.stringify(serializedBenefits)}/><label className="label">Sector<select className="field" name="zoneId" required>{zones.map((zone) => <option value={zone.id} key={zone.id}>{zone.name}</option>)}</select></label><label className="label">Nombre<input className="field" name="name" placeholder="Mesa VIP 08" required/></label><label className="label">Descripción <span className="text-neutral-600">(opcional)</span><input className="field" name="description" placeholder="Vista a cabina"/></label><div className="grid grid-cols-2 gap-4"><label className="label">Personas<input className="field" name="capacity" type="number" inputMode="numeric" min="1" max="1000" defaultValue="8" required/></label><label className="label">Precio<div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500">$</span><input className="field pl-9" name="pricePesos" type="number" min="0" step="0.01" defaultValue="240000" required/></div></label></div><div className="grid gap-4 sm:grid-cols-2"><label className="label">Fee de mesa <span className="text-neutral-600">(opcional)</span><div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500">%</span><input className="field pl-9" name="serviceFeePercent" type="number" min="0" max="100" step="0.01" placeholder="Usar general"/></div></label><label className="label">Puerta <span className="text-neutral-600">(opcional)</span><select className="field" name="accessGateId"><option value="">Cualquier acceso</option>{gates.map((gate) => <option value={gate.id} key={gate.id}>{gate.name}</option>)}</select></label></div><fieldset className="rounded-2xl border border-white/[.08] p-4"><legend className="px-2 text-sm font-black">¿Qué incluye?</legend><p className="mt-1 text-sm text-neutral-500">Los accesos se toman automáticamente de la cantidad de personas.</p>{benefits.length > 0 && <div className="mt-4 grid gap-2">{benefits.map((benefit) => <div className="flex items-center justify-between gap-3 rounded-xl bg-white/[.04] px-3 py-2 text-sm" key={benefit.id}><span>{benefit.quantity} {benefit.name}</span><button className="grid size-9 place-items-center text-neutral-500 hover:text-white" type="button" aria-label={`Quitar ${benefit.name}`} onClick={() => setBenefits((items) => items.filter((item) => item.id !== benefit.id))}><X size={15}/></button></div>)}</div>}<div className="mt-4 grid grid-cols-[1fr_86px] gap-2 sm:grid-cols-[130px_1fr_86px_auto]"><select className="field" aria-label="Tipo de beneficio" value={draftType} onChange={(event) => setDraftType(event.target.value as DraftBenefit["type"])}><option value="drink">Bebida</option><option value="product">Producto</option><option value="generic">Otro</option></select><input className="field max-sm:col-span-2 max-sm:row-start-2" aria-label="Nombre del beneficio" placeholder="Botellas" value={draftName} onChange={(event) => setDraftName(event.target.value)}/><input className="field" aria-label="Cantidad del beneficio" type="number" min="1" value={draftQuantity} onChange={(event) => setDraftQuantity(Number(event.target.value))}/><button className="btn btn-secondary max-sm:col-span-2" type="button" onClick={addBenefit}><Plus size={16}/>Agregar</button></div></fieldset><ActionMessage message={state.error}/><SubmitButton className="btn btn-primary min-h-14"><Armchair size={17}/>Crear mesa</SubmitButton></form></Drawer>;
}

function Drawer({ title, eyebrow, close, children }: { title: string; eyebrow: string; close: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-50 flex items-end bg-black/70 backdrop-blur-sm sm:items-center sm:justify-center" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section className="max-h-[94dvh] w-full overflow-y-auto rounded-t-[1.5rem] border border-white/10 bg-[var(--surface)] p-5 shadow-2xl sm:max-w-2xl sm:rounded-[1.5rem] sm:p-7" role="dialog" aria-modal="true" aria-label={title}><div className="mb-6 flex items-start justify-between gap-4"><div><p className="eyebrow">{eyebrow}</p><h2 className="mt-2 text-2xl font-black tracking-[-.035em]">{title}</h2></div><button type="button" aria-label="Cerrar" className="btn btn-ghost btn-icon min-h-11" onClick={close}><X size={18}/></button></div>{children}</section></div>;
}

function EmptyState({ onCreate, editable }: { onCreate: () => void; editable: boolean }) {
  return <div className="card mt-7 px-6 py-14 text-center"><div className="mx-auto grid size-14 place-items-center rounded-2xl bg-white/[.04] text-neutral-600"><Armchair size={26}/></div><h2 className="mt-5 text-xl font-black">Organizá tus mesas por sector</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-neutral-500">Creá VIP, Terraza o el nombre que uses. Después agregá cada mesa con capacidad, precio y beneficios.</p>{editable && <button className="btn btn-primary mt-6" type="button" onClick={onCreate}><Plus size={17}/>Crear primer sector</button>}</div>;
}
