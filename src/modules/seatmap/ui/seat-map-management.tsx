"use client";

import { useActionState, useState } from "react";
import { Grid3x3, LayoutGrid, Pencil, Plus, Trash2, X } from "lucide-react";
import { createSeatMapSection, deleteSeatMapSection, setEventSeatActive, updateSeatMapSection } from "../application/actions";
import { seatAvailabilityLabel } from "../domain/seat-map";
import type { EventSeat, SeatMapSection } from "@/shared/database/types";
import { formatMoney } from "@/shared/lib/format";
import { ActionMessage } from "@/shared/ui/action-message";
import { SubmitButton } from "@/shared/ui/submit-button";
import { EmptyState } from "@/shared/ui/empty-state";
import { ColorDot } from "@/shared/ui/color-dot";

type ManagedSeat = EventSeat & { availability_status: "available" | "held" | "sold" };

export function SeatMapManagement({ eventId, sections, seats, editable }: { eventId: string; sections: SeatMapSection[]; seats: ManagedSeat[]; editable: boolean }) {
  const [open, setOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<SeatMapSection | null>(null);
  const activeSections = sections.filter((section) => section.active);
  return <>
    <div className="flex flex-wrap gap-2">
      <button className="btn btn-primary" type="button" onClick={() => setOpen(true)} disabled={!editable}><Plus size={17}/>Nueva sección de asientos</button>
    </div>
    {!activeSections.length ? <div className="mt-7"><EmptyState icon={Grid3x3} title="Armá tu mapa de asientos" description="Definí filas y asientos por fila, y generamos automáticamente cada asiento numerado." action={editable && <button className="btn btn-primary" type="button" onClick={() => setOpen(true)}><Plus size={17}/>Crear primera sección</button>}/></div> : <div className="mt-7 grid gap-6 lg:grid-cols-[280px_1fr]">
      <aside className="card h-fit p-5"><div className="flex items-center gap-2"><LayoutGrid size={17} className="text-[var(--accent)]"/><h2 className="font-black">Secciones</h2></div><ul className="mt-4 grid gap-1">{activeSections.map((section, index) => {
        const count = seats.filter((seat) => seat.section_id === section.id).length;
        return <li key={section.id}><a href={`#section-${section.id}`} className="flex items-center justify-between gap-3 rounded-xl px-2 py-2.5 text-sm font-bold transition hover:bg-white/[.04]"><span className="flex items-center gap-2.5"><ColorDot index={index}/>{section.name}</span><span className="text-xs font-semibold text-neutral-500">{count}</span></a></li>;
      })}</ul></aside>
      <div className="grid gap-9">{activeSections.map((section) => {
        const sectionSeats = seats.filter((seat) => seat.section_id === section.id);
        return <div id={`section-${section.id}`} key={section.id}><SectionGrid eventId={eventId} section={section} seats={sectionSeats} editable={editable} onEdit={() => setEditingSection(section)}/></div>;
      })}</div>
    </div>}
    {open && <SectionDrawer eventId={eventId} close={() => setOpen(false)}/>}
    {editingSection && <EditSectionDrawer eventId={eventId} section={editingSection} close={() => setEditingSection(null)}/>}
  </>;
}

function SectionGrid({ eventId, section, seats, editable, onEdit }: { eventId: string; section: SeatMapSection; seats: ManagedSeat[]; editable: boolean; onEdit: () => void }) {
  const rows = Array.from(new Set(seats.map((seat) => seat.row_label))).sort();
  const sold = seats.filter((seat) => seat.availability_status === "sold").length;
  const held = seats.filter((seat) => seat.availability_status === "held").length;
  const hasActivity = sold > 0 || held > 0;
  return <section>
    <div className="flex items-end justify-between gap-4 border-b border-white/[.08] pb-3">
      <div><p className="eyebrow">Sección</p><h2 className="mt-1 text-2xl font-black tracking-[-.035em]">{section.name}</h2>{section.description && <p className="mt-1 text-sm text-neutral-500">{section.description}</p>}</div>
      <div className="flex items-start gap-3">
        <div className="text-right"><p className="text-xl font-black">{section.base_price_amount === 0 ? "Gratis" : formatMoney(section.base_price_amount, section.currency)}</p><p className="text-xs font-bold text-neutral-600">{sold}/{seats.length} vendidos</p></div>
        {editable && <div className="flex gap-1.5">
          <button type="button" className="btn btn-ghost btn-icon min-h-10" aria-label={`Editar ${section.name}`} onClick={onEdit}><Pencil size={15}/></button>
          {!hasActivity && <form action={deleteSeatMapSection} onSubmit={(event) => { if (!window.confirm(`¿Eliminar la sección "${section.name}" y sus ${seats.length} asientos?`)) event.preventDefault(); }}>
            <input type="hidden" name="eventId" value={eventId}/>
            <input type="hidden" name="sectionId" value={section.id}/>
            <button type="submit" className="btn btn-ghost btn-icon min-h-10 text-red-300" aria-label={`Eliminar ${section.name}`}><Trash2 size={15}/></button>
          </form>}
        </div>}
      </div>
    </div>
    <div className="mt-5 overflow-x-auto"><div className="inline-flex min-w-full flex-col items-center gap-2 py-2">
      <div className="mb-3 h-2 w-2/3 rounded-full bg-white/[.08]"/>
      {rows.map((row) => <div className="flex items-center gap-1.5" key={row}>
        <span className="w-5 shrink-0 text-xs font-black text-neutral-600">{row}</span>
        {seats.filter((seat) => seat.row_label === row).sort((a, b) => a.seat_number - b.seat_number).map((seat) => <SeatCell eventId={eventId} seat={seat} editable={editable} key={seat.id}/>)}
      </div>)}
    </div></div>
  </section>;
}

function SeatCell({ eventId, seat, editable }: { eventId: string; seat: ManagedSeat; editable: boolean }) {
  const label = seatAvailabilityLabel(seat.availability_status, seat.active);
  const tone = !seat.active ? "bg-white/[.03] text-neutral-700 border-white/[.06]"
    : seat.availability_status === "sold" ? "bg-red-500/15 text-red-300 border-red-500/20"
    : seat.availability_status === "held" ? "bg-amber-500/15 text-amber-300 border-amber-500/20"
    : "bg-[var(--accent)]/10 text-[var(--accent)] border-[var(--accent)]/20";
  const disableToggle = !editable || seat.availability_status !== "available";
  return <form action={setEventSeatActive} title={`${seat.label} · ${label}`}>
    <input type="hidden" name="eventId" value={eventId}/>
    <input type="hidden" name="seatId" value={seat.id}/>
    <input type="hidden" name="active" value={seat.active ? "false" : "true"}/>
    <button className={`grid size-7 shrink-0 place-items-center rounded-md border text-[9px] font-black transition ${tone} ${disableToggle ? "cursor-default" : "hover:scale-110"}`} type="submit" disabled={disableToggle} aria-label={`${seat.label}: ${label}`}>{seat.seat_number}</button>
  </form>;
}

function SectionDrawer({ eventId, close }: { eventId: string; close: () => void }) {
  const [state, action] = useActionState(createSeatMapSection, {});
  const [rows, setRows] = useState(5);
  const [seatsPerRow, setSeatsPerRow] = useState(8);
  return <Drawer title="Nueva sección de asientos" eyebrow="Mapa de asientos" close={close}>
    <form action={action} className="grid gap-5">
      <input type="hidden" name="eventId" value={eventId}/>
      <label className="label">Nombre<input className="field" name="name" placeholder="Platea" required autoFocus/></label>
      <label className="label">Descripción <span className="text-neutral-600">(opcional)</span><input className="field" name="description" placeholder="Planta baja, vista al escenario"/></label>
      <div className="grid grid-cols-2 gap-4">
        <label className="label">Filas<input className="field" name="rows" type="number" inputMode="numeric" min="1" max="26" value={rows} onChange={(event) => setRows(Number(event.target.value) || 1)} required/></label>
        <label className="label">Asientos por fila<input className="field" name="seatsPerRow" type="number" inputMode="numeric" min="1" max="60" value={seatsPerRow} onChange={(event) => setSeatsPerRow(Number(event.target.value) || 1)} required/></label>
      </div>
      <p className="-mt-2 text-sm text-neutral-500">Se van a crear {rows * seatsPerRow} asientos numerados (filas A–{String.fromCharCode(64 + Math.min(rows, 26))}).</p>
      <div className="grid grid-cols-2 gap-4">
        <label className="label">Precio<div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500">$</span><input className="field pl-9" name="pricePesos" type="number" min="0" step="0.01" defaultValue="15000" required/></div></label>
        <label className="label">Fee <span className="text-neutral-600">(opcional)</span><div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500">%</span><input className="field pl-9" name="serviceFeePercent" type="number" min="0" max="100" step="0.01" placeholder="Usar general"/></div></label>
      </div>
      <ActionMessage message={state.error}/>
      <SubmitButton className="btn btn-primary min-h-14"><Grid3x3 size={17}/>Generar sección</SubmitButton>
    </form>
  </Drawer>;
}

function EditSectionDrawer({ eventId, section, close }: { eventId: string; section: SeatMapSection; close: () => void }) {
  const [state, action] = useActionState(updateSeatMapSection, {});
  return <Drawer title="Editar sección" eyebrow="Mapa de asientos" close={close}>
    <form action={action} className="grid gap-5">
      <input type="hidden" name="eventId" value={eventId}/>
      <input type="hidden" name="sectionId" value={section.id}/>
      <label className="label">Nombre<input className="field" name="name" defaultValue={section.name} required autoFocus/></label>
      <label className="label">Descripción <span className="text-neutral-600">(opcional)</span><input className="field" name="description" defaultValue={section.description}/></label>
      <div className="grid grid-cols-2 gap-4">
        <label className="label">Precio<div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500">$</span><input className="field pl-9" name="pricePesos" type="number" min="0" step="0.01" defaultValue={section.base_price_amount / 100} required/></div></label>
        <label className="label">Fee <span className="text-neutral-600">(opcional)</span><div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500">%</span><input className="field pl-9" name="serviceFeePercent" type="number" min="0" max="100" step="0.01" defaultValue={section.service_fee_bps != null ? section.service_fee_bps / 100 : ""} placeholder="Usar general"/></div></label>
      </div>
      <p className="text-xs text-neutral-600">Las filas y asientos por fila no se pueden cambiar una vez generados. Para eso, borrá la sección (si no tiene ventas) y creá una nueva.</p>
      <ActionMessage message={state.error}/>
      <SubmitButton className="btn btn-primary min-h-14">Guardar cambios</SubmitButton>
    </form>
  </Drawer>;
}

function Drawer({ title, eyebrow, close, children }: { title: string; eyebrow: string; close: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-50 flex items-end bg-black/70 backdrop-blur-sm sm:items-center sm:justify-center" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section className="max-h-[94dvh] w-full overflow-y-auto rounded-t-[1.5rem] border border-white/10 bg-[var(--surface)] p-5 shadow-2xl sm:max-w-2xl sm:rounded-[1.5rem] sm:p-7" role="dialog" aria-modal="true" aria-label={title}><div className="mb-6 flex items-start justify-between gap-4"><div><p className="eyebrow">{eyebrow}</p><h2 className="mt-2 text-2xl font-black tracking-[-.035em]">{title}</h2></div><button type="button" aria-label="Cerrar" className="btn btn-ghost btn-icon min-h-11" onClick={close}><X size={18}/></button></div>{children}</section></div>;
}
