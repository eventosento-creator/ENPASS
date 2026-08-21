import { Trash2 } from "lucide-react";
import type { TicketType } from "@/shared/database/types";
import { formatMoney } from "@/shared/lib/format";
import { deleteTicketType } from "../application/actions";
import { TicketTypeEditForm, TicketTypeForm } from "./forms";

export function TicketTypeEditor({ organizationId, eventId, ticketTypes, editable = true }: { organizationId: string; eventId: string; ticketTypes: TicketType[]; editable?: boolean }) {
  return <div className="grid gap-4">
    {ticketTypes.map((type, index) => <article key={type.id} className="rounded-[1.15rem] border border-white/[.08] bg-[#151517] p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-black uppercase tracking-[.12em] text-[var(--accent)]">{index === ticketTypes.length - 1 ? "Venta final" : `Preventa ${index + 1}`}</p>{!editable && <h3 className="mt-2 text-lg font-bold">{type.name}</h3>}</div>{editable && <form action={deleteTicketType}><input type="hidden" name="eventId" value={eventId}/><input type="hidden" name="ticketTypeId" value={type.id}/><input type="hidden" name="phaseId" value={type.sale_phase_id ?? ""}/><button className="grid size-9 place-items-center rounded-full text-neutral-600 hover:bg-red-400/10 hover:text-red-300" aria-label={`Eliminar ${type.name}`}><Trash2 size={16}/></button></form>}</div>{editable ? <TicketTypeEditForm organizationId={organizationId} eventId={eventId} ticketType={type}/> : <div className="mt-5 grid grid-cols-2 gap-3"><Value label="Precio" value={formatMoney(type.price_amount, type.currency)}/><Value label="Cantidad" value={String(type.quantity)}/></div>}{index < ticketTypes.length - 1 && <p className="mt-4 border-t border-white/[.06] pt-4 text-xs text-neutral-500">Cuando se agote, se activa la siguiente preventa.</p>}</article>)}
    {editable && <div className="mt-1"><p className="mb-3 text-sm font-bold text-neutral-300">+ Agregar entrada</p><TicketTypeForm organizationId={organizationId} eventId={eventId}/></div>}
  </div>;
}

function Value({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-black/25 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-neutral-600">{label}</p><p className="mt-1 font-black">{value}</p></div>; }
