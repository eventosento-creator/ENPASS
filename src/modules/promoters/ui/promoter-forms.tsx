"use client";

import { useActionState, useState } from "react";
import { Plus, UserPlus, X } from "lucide-react";
import {
  createEventPromoter,
  createNewPromoterInvitation,
  updateEventPromoter,
  upsertPromoterCommissionRule,
  upsertPromoterTableCommissionRule,
} from "../application/actions";
import type { EventPromoter, EventTable, Promoter, PromoterCommissionRule, TicketType } from "@/shared/database/types";
import { SubmitButton } from "@/shared/ui/submit-button";
import { ActionMessage } from "@/shared/ui/action-message";
import { ShareLinkButtons } from "./share-link-buttons";

export function AddPromoterDrawer({ eventId }: { eventId: string }) {
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [publicSlug, setPublicSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [commissionType, setCommissionType] = useState<"fixed_per_ticket" | "percentage">("percentage");
  const [state, action] = useActionState(createEventPromoter, {});

  function updateFirstName(value: string) {
    setFirstName(value);
    if (!slugTouched) setPublicSlug(slugify(value));
  }

  return <>
    <button className="btn btn-primary" type="button" onClick={() => setOpen(true)}><UserPlus size={17}/>Agregar RRPP</button>
    {open && <div className="fixed inset-0 z-50 flex items-end bg-black/70 backdrop-blur-sm sm:items-center sm:justify-center" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section aria-modal="true" aria-label="Agregar RRPP" role="dialog" className="max-h-[92dvh] w-full overflow-y-auto rounded-t-[1.5rem] border border-white/10 bg-[var(--surface)] p-5 shadow-2xl sm:max-w-xl sm:rounded-[1.5rem] sm:p-7">
        <div className="flex items-start justify-between gap-4"><div><p className="eyebrow">Nuevo RRPP</p><h2 className="mt-2 text-2xl font-black tracking-[-.03em]">Un link propio, ventas claras.</h2></div><button type="button" aria-label="Cerrar" className="btn btn-ghost btn-icon min-h-11" onClick={() => setOpen(false)}><X size={18}/></button></div>
        {state.publicLink ? <div className="mt-7"><div className="status-success rounded-xl p-4"><p className="font-bold">{state.success}</p><p className="mt-2 break-all text-xs text-neutral-300">{state.publicLink}</p></div><div className="mt-4"><ShareLinkButtons url={state.publicLink}/></div>{state.accessUrl && <div className="mt-6 border-t border-white/[.07] pt-5"><p className="text-xs font-bold uppercase tracking-wider text-neutral-600">Acceso privado al panel</p><p className="mt-2 text-sm text-neutral-400">{state.emailSent ? "También llegó por email. Este link es de un solo uso." : "Copialo y envialo de forma privada. Es de un solo uso."}</p><div className="mt-3"><ShareLinkButtons url={state.accessUrl} shareLabel="Compartir acceso"/></div></div>}</div> : <form action={action} className="mt-7 grid gap-4"><input type="hidden" name="eventId" value={eventId}/><div className="grid gap-4 sm:grid-cols-2"><label className="label">Nombre<input className="field" name="firstName" value={firstName} onChange={(event) => updateFirstName(event.target.value)} required/></label><label className="label">Apellido <span className="text-neutral-600">(opcional)</span><input className="field" name="lastName"/></label></div><label className="label">Email <span className="text-neutral-600">(opcional)</span><input className="field" name="email" type="email" autoComplete="email"/><span className="text-xs font-normal text-neutral-600">Si lo completás, enviamos la invitación a Mailpit local.</span></label><div className="grid gap-4 sm:grid-cols-2"><label className="label">Teléfono <span className="text-neutral-600">(opcional)</span><input className="field" name="phone" type="tel"/></label><label className="label">Instagram <span className="text-neutral-600">(opcional)</span><input className="field" name="instagram" placeholder="@usuario"/></label></div><label className="label">Slug del link<div className="flex items-center rounded-[.85rem] border border-white/10 bg-[var(--background-soft)] pl-3 focus-within:border-[var(--accent)]"><span className="text-sm text-neutral-600">/</span><input className="min-h-[3.15rem] w-full bg-transparent px-2 outline-none" name="publicSlug" value={publicSlug} onChange={(event) => { setSlugTouched(true); setPublicSlug(slugify(event.target.value)); }} required/></div></label><fieldset className="mt-2"><legend className="label">Comisión general</legend><div className="mt-2 grid grid-cols-2 gap-2"><label className={`cursor-pointer rounded-xl border p-3 text-sm font-bold ${commissionType === "fixed_per_ticket" ? "border-[var(--accent)] bg-[var(--accent)]/[.06]" : "border-white/10"}`}><input className="sr-only" type="radio" name="commissionType" value="fixed_per_ticket" checked={commissionType === "fixed_per_ticket"} onChange={() => setCommissionType("fixed_per_ticket")}/>Por entrada</label><label className={`cursor-pointer rounded-xl border p-3 text-sm font-bold ${commissionType === "percentage" ? "border-[var(--accent)] bg-[var(--accent)]/[.06]" : "border-white/10"}`}><input className="sr-only" type="radio" name="commissionType" value="percentage" checked={commissionType === "percentage"} onChange={() => setCommissionType("percentage")}/>Porcentaje</label></div></fieldset><label className="label">{commissionType === "percentage" ? "Porcentaje" : "Monto por entrada"}<div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500">{commissionType === "percentage" ? "%" : "$"}</span><input key={commissionType} className="field pl-9" name="commissionValue" type="number" min="0.01" max={commissionType === "percentage" ? "100" : undefined} step="0.01" defaultValue={commissionType === "percentage" ? "5" : "1000"} required/></div></label><ActionMessage message={state.error}/><SubmitButton className="btn btn-primary min-h-14"><Plus size={17}/>Crear RRPP</SubmitButton></form>}
      </section>
    </div>}
  </>;
}

export function EditPromoterForm({ eventId, relation, promoter }: { eventId: string; relation: EventPromoter; promoter: Promoter }) {
  const [state, action] = useActionState(updateEventPromoter, {});
  return <form action={action} className="card grid gap-4 p-5 sm:p-6"><input type="hidden" name="eventId" value={eventId}/><input type="hidden" name="eventPromoterId" value={relation.id}/><div><p className="eyebrow">Perfil</p><h2 className="section-title mt-2">Datos y link</h2></div><div className="grid gap-4 sm:grid-cols-2"><label className="label">Nombre<input className="field" name="firstName" defaultValue={promoter.first_name} required/></label><label className="label">Apellido<input className="field" name="lastName" defaultValue={promoter.last_name ?? ""}/></label></div><label className="label">Email<input className="field" name="email" type="email" defaultValue={promoter.email ?? ""}/></label><div className="grid gap-4 sm:grid-cols-2"><label className="label">Teléfono<input className="field" name="phone" defaultValue={promoter.phone ?? ""}/></label><label className="label">Instagram<input className="field" name="instagram" defaultValue={promoter.instagram ?? ""}/></label></div><label className="label">Slug<input className="field" name="publicSlug" defaultValue={relation.public_slug} required/></label><ActionMessage message={state.error}/><ActionMessage message={state.success} tone="success"/><SubmitButton className="btn btn-secondary">Guardar cambios</SubmitButton></form>;
}

export function CommissionRuleForm({ eventId, relationId, ticketTypes, rules }: { eventId: string; relationId: string; ticketTypes: TicketType[]; rules: PromoterCommissionRule[] }) {
  const [state, action] = useActionState(upsertPromoterCommissionRule, {});
  const ticketRules = rules.filter((rule) => rule.subject_type === "ticket");
  const general = ticketRules.find((rule) => rule.ticket_type_id === null);
  const [ticketTypeId, setTicketTypeId] = useState("");
  const [commissionType, setCommissionType] = useState<"fixed_per_ticket" | "percentage">(general?.commission_type ?? "percentage");
  const [commissionValue, setCommissionValue] = useState(String((general?.commission_value ?? 500) / 100));

  function selectTarget(nextTicketTypeId: string) {
    setTicketTypeId(nextTicketTypeId);
    const rule = ticketRules.find((candidate) => candidate.ticket_type_id === (nextTicketTypeId || null)) ?? general;
    setCommissionType(rule?.commission_type ?? "percentage");
    setCommissionValue(String((rule?.commission_value ?? 500) / 100));
  }

  return <section className="card p-5 sm:p-6">
    <p className="eyebrow">Comisión</p><h2 className="section-title mt-2">Regla general y excepciones</h2><p className="mt-2 text-sm leading-6 text-neutral-500">El porcentaje usa solo el valor base de las entradas. Las ventas confirmadas no cambian al editar.</p>
    <form action={action} className="mt-6 grid gap-4"><input type="hidden" name="eventId" value={eventId}/><input type="hidden" name="eventPromoterId" value={relationId}/><label className="label">Aplicar a<select className="field" name="ticketTypeId" value={ticketTypeId} onChange={(event) => selectTarget(event.target.value)}><option value="">Todas las entradas</option>{ticketTypes.map((type) => <option value={type.id} key={type.id}>{type.name}</option>)}</select></label><div className="grid gap-4 sm:grid-cols-2"><label className="label">Tipo<select className="field" name="commissionType" value={commissionType} onChange={(event) => setCommissionType(event.target.value as "fixed_per_ticket" | "percentage")}><option value="fixed_per_ticket">Por entrada</option><option value="percentage">Porcentaje</option></select></label><label className="label">Valor<div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500">{commissionType === "percentage" ? "%" : "$"}</span><input className="field pl-9" name="commissionValue" type="number" min="0.01" max={commissionType === "percentage" ? "100" : "1000000"} step="0.01" value={commissionValue} onChange={(event) => setCommissionValue(event.target.value)} required/></div></label></div><ActionMessage message={state.error}/><ActionMessage message={state.success} tone="success"/><SubmitButton className="btn btn-secondary">Guardar regla</SubmitButton></form>
    {ticketRules.length > 0 && <div className="mt-6 border-t border-white/[.07] pt-5"><p className="text-xs font-bold uppercase tracking-wider text-neutral-600">Configuración actual</p><div className="mt-3 grid gap-2">{ticketRules.map((rule) => <div className="flex items-center justify-between gap-4 rounded-xl bg-white/[.03] px-4 py-3 text-sm" key={rule.id}><span className="text-neutral-400">{rule.ticket_type_id ? ticketTypes.find((type) => type.id === rule.ticket_type_id)?.name ?? "Entrada" : "Todas las entradas"}</span><strong>{rule.commission_type === "percentage" ? `${rule.commission_value / 100}%` : `$${new Intl.NumberFormat("es-AR").format(rule.commission_value / 100)} / entrada`}</strong></div>)}</div></div>}
  </section>;
}

export function TableCommissionRuleForm({ eventId, relationId, tables, rules }: { eventId: string; relationId: string; tables: EventTable[]; rules: PromoterCommissionRule[] }) {
  const [state, action] = useActionState(upsertPromoterTableCommissionRule, {});
  const tableRules = rules.filter((rule) => rule.subject_type === "table");
  const general = tableRules.find((rule) => rule.event_table_id === null);
  const [eventTableId, setEventTableId] = useState("");
  const [commissionType, setCommissionType] = useState<"fixed_per_ticket" | "percentage">(general?.commission_type ?? "percentage");
  const [commissionValue, setCommissionValue] = useState(String((general?.commission_value ?? 500) / 100));
  function selectTarget(nextTableId: string) {
    setEventTableId(nextTableId);
    const rule = tableRules.find((candidate) => candidate.event_table_id === (nextTableId || null)) ?? general;
    setCommissionType(rule?.commission_type ?? "percentage");
    setCommissionValue(String((rule?.commission_value ?? 500) / 100));
  }
  return <section className="card p-5 sm:p-6"><p className="eyebrow">Comisión de mesas</p><h2 className="section-title mt-2">Regla general y excepciones</h2><p className="mt-2 text-sm leading-6 text-neutral-500">El porcentaje usa el precio base de la mesa y excluye el cargo de servicio.</p><form action={action} className="mt-6 grid gap-4"><input type="hidden" name="eventId" value={eventId}/><input type="hidden" name="eventPromoterId" value={relationId}/><label className="label">Aplicar a<select className="field" name="eventTableId" value={eventTableId} onChange={(event) => selectTarget(event.target.value)}><option value="">Todas las mesas</option>{tables.map((table) => <option value={table.id} key={table.id}>{table.name}</option>)}</select></label><div className="grid gap-4 sm:grid-cols-2"><label className="label">Tipo<select className="field" name="commissionType" value={commissionType} onChange={(event) => setCommissionType(event.target.value as "fixed_per_ticket" | "percentage")}><option value="fixed_per_ticket">Fija por mesa</option><option value="percentage">Porcentaje</option></select></label><label className="label">Valor<div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500">{commissionType === "percentage" ? "%" : "$"}</span><input className="field pl-9" name="commissionValue" type="number" min="0.01" max={commissionType === "percentage" ? "100" : "1000000"} step="0.01" value={commissionValue} onChange={(event) => setCommissionValue(event.target.value)} required/></div></label></div><ActionMessage message={state.error}/><ActionMessage message={state.success} tone="success"/><SubmitButton className="btn btn-secondary">Guardar regla de mesas</SubmitButton></form>{tableRules.length > 0 && <div className="mt-6 border-t border-white/[.07] pt-5"><p className="text-xs font-bold uppercase tracking-wider text-neutral-600">Configuración actual</p><div className="mt-3 grid gap-2">{tableRules.map((rule) => <div className="flex items-center justify-between gap-4 rounded-xl bg-white/[.03] px-4 py-3 text-sm" key={rule.id}><span className="text-neutral-400">{rule.event_table_id ? tables.find((table) => table.id === rule.event_table_id)?.name ?? "Mesa" : "Todas las mesas"}</span><strong>{rule.commission_type === "percentage" ? `${rule.commission_value / 100}%` : `$${new Intl.NumberFormat("es-AR").format(rule.commission_value / 100)} / mesa`}</strong></div>)}</div></div>}</section>;
}

export function PromoterInviteForm({ eventId, eventPromoterId, hasEmail }: { eventId: string; eventPromoterId: string; hasEmail: boolean }) {
  const [state, action] = useActionState(createNewPromoterInvitation, {});
  return <div className="card p-5 sm:p-6"><p className="text-xs font-bold uppercase tracking-wider text-neutral-600">Acceso al panel RRPP</p><p className="mt-2 text-sm leading-6 text-neutral-400">Creá un acceso privado, revocable y de un solo uso. La sesión posterior dura 30 días.</p><form action={action} className="mt-4"><input type="hidden" name="eventId" value={eventId}/><input type="hidden" name="eventPromoterId" value={eventPromoterId}/><input type="hidden" name="sendEmail" value={hasEmail ? "true" : "false"}/><SubmitButton className="btn btn-secondary w-full">{hasEmail ? "Enviar nueva invitación" : "Crear link de acceso"}</SubmitButton></form><div className="mt-4"><ActionMessage message={state.error}/><ActionMessage message={state.success} tone="success"/></div>{state.accessUrl && <div className="mt-4"><ShareLinkButtons url={state.accessUrl} shareLabel="Compartir acceso"/></div>}</div>;
}

function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
