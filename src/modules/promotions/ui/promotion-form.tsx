"use client";

import { useActionState, useMemo, useState } from "react";
import { savePromotion, type PromotionActionState } from "../application/actions";
import { promotionKinds } from "../domain/promotions";
import type { Promotion, PromotionKind } from "@/shared/database/types";
import { ActionMessage } from "@/shared/ui/action-message";
import { SubmitButton } from "@/shared/ui/submit-button";
import { formatMoney } from "@/shared/lib/format";

export type PromotionScopeEvent = { id: string; name: string; starts_at: string; status: string };
export type PromotionScopeTicketType = { id: string; eventId: string; name: string; price: number };
export type PromotionFormInitial = {
  promotion: Promotion; eventIds: string[]; ticketTypeIds: string[]; startsAtLocal: string; endsAtLocal: string;
};

const SAMPLE_PRICE = 2_000_000; // $20.000 de ejemplo

function pesos(centavos: number | null | undefined) {
  return centavos == null ? "" : String(centavos / 100);
}

export function PromotionForm({ organizationId, events, ticketTypes, initial, currency = "ARS" }: {
  organizationId: string; events: PromotionScopeEvent[]; ticketTypes: PromotionScopeTicketType[]; initial?: PromotionFormInitial; currency?: string;
}) {
  const [state, action] = useActionState<PromotionActionState, FormData>(savePromotion, {});
  const promotion = initial?.promotion;
  const [kind, setKind] = useState<PromotionKind>(promotion?.kind ?? "percent");
  const [percent, setPercent] = useState(promotion?.percent_bps ? String(promotion.percent_bps / 100) : "20");
  const [fixed, setFixed] = useState(pesos(promotion?.fixed_amount));
  const [special, setSpecial] = useState(pesos(promotion?.special_price_amount));
  const [code, setCode] = useState(promotion?.code ?? "");
  const [allEvents, setAllEvents] = useState(promotion?.all_events ?? false);
  const [eventIds, setEventIds] = useState<string[]>(initial?.eventIds ?? []);
  const [ticketTypeIds, setTicketTypeIds] = useState<string[]>(initial?.ticketTypeIds ?? []);
  const money = (centavos: number) => formatMoney(centavos, currency);

  const visibleTypes = useMemo(() => ticketTypes.filter((type) => allEvents || eventIds.includes(type.eventId)), [ticketTypes, allEvents, eventIds]);
  const eventName = (id: string) => events.find((event) => event.id === id)?.name ?? "Evento";

  function toggleEvent(id: string) {
    setEventIds((current) => {
      const next = current.includes(id) ? current.filter((value) => value !== id) : [...current, id];
      setTicketTypeIds((types) => types.filter((typeId) => { const type = ticketTypes.find((item) => item.id === typeId); return type && next.includes(type.eventId); }));
      return next;
    });
  }

  const example = useMemo(() => {
    const value = (n: string) => Number(n.replace(",", "."));
    if (kind === "percent" && value(percent) > 0 && value(percent) < 100) return `Entrada de ${money(SAMPLE_PRICE)} → ${money(Math.round(SAMPLE_PRICE * (1 - value(percent) / 100)))}`;
    if (kind === "fixed" && value(fixed) > 0) return `Entrada de ${money(SAMPLE_PRICE)} → ${money(Math.max(SAMPLE_PRICE - Math.round(value(fixed) * 100), 0))}`;
    if (kind === "special_price" && value(special) > 0) return `Entrada de ${money(SAMPLE_PRICE)} → ${money(Math.round(value(special) * 100))}`;
    if (kind === "two_for_one") return `2 entradas de ${money(SAMPLE_PRICE)} → pagás ${money(SAMPLE_PRICE)}`;
    if (kind === "free") return "Entradas gratis (cortesía): no se cobra nada.";
    return null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, percent, fixed, special, currency]);

  return <form action={action} className="grid gap-6">
    <input type="hidden" name="organizationId" value={organizationId}/>
    {promotion && <input type="hidden" name="id" value={promotion.id}/>}

    <section className="card grid gap-4 p-5 sm:p-6">
      <h2 className="text-lg font-black">Información general</h2>
      <label className="label">Nombre interno<input className="field" name="name" defaultValue={promotion?.name} placeholder="Descuento amigos de Elías" maxLength={80} required/><span className="text-xs font-normal text-neutral-500">Solo lo ves vos.</span></label>
      <label className="label">Código<input className="field font-mono uppercase" name="code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))} placeholder="ELIAS20" minLength={3} maxLength={30} required autoCapitalize="characters" autoComplete="off"/><span className="text-xs font-normal text-neutral-500">Lo escribe el comprador. Da lo mismo mayúsculas o minúsculas. Solo letras, números, guion y guion bajo.</span></label>
      <label className="label">Descripción <span className="font-normal text-neutral-600">(opcional)</span><textarea className="field min-h-20 resize-y" name="description" defaultValue={promotion?.description ?? ""} maxLength={300} placeholder="Para qué es este código, a quién se lo diste…"/></label>
      <label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input type="checkbox" name="active" defaultChecked={promotion?.active ?? true} className="size-4 accent-[var(--accent)]"/>Activo (se puede usar en el checkout)</label>
    </section>

    <section className="card grid gap-4 p-5 sm:p-6">
      <h2 className="text-lg font-black">Tipo de descuento</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {promotionKinds.map((option) => <label key={option.value} className={`flex cursor-pointer gap-3 rounded-xl border p-3.5 text-sm transition ${kind === option.value ? "border-[var(--accent)] bg-[var(--accent)]/5" : "border-[var(--border)]"}`}>
          <input type="radio" name="kind" value={option.value} checked={kind === option.value} onChange={() => setKind(option.value)} className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"/>
          <span><b className="block">{option.label}</b><span className="text-xs text-neutral-500">{option.hint}</span></span>
        </label>)}
      </div>
      {kind === "percent" && <label className="label">Porcentaje de descuento<span className="relative block"><input className="field pr-10" name="percent" type="number" inputMode="decimal" min="0.01" max="99.99" step="0.01" value={percent} onChange={(event) => setPercent(event.target.value)} required/><span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500">%</span></span></label>}
      {kind === "fixed" && <label className="label">Monto a descontar por entrada (en pesos)<input className="field" name="fixedPesos" type="number" inputMode="decimal" min="0.01" step="0.01" value={fixed} onChange={(event) => setFixed(event.target.value)} required/></label>}
      {kind === "special_price" && <label className="label">Precio especial por entrada (en pesos)<input className="field" name="specialPesos" type="number" inputMode="decimal" min="0.01" step="0.01" value={special} onChange={(event) => setSpecial(event.target.value)} required/><span className="text-xs font-normal text-neutral-500">Si una entrada ya cuesta menos que esto, no se le aplica nada.</span></label>}
      {example && <p className="rounded-xl bg-[var(--surface-raised)] px-4 py-3 text-sm font-semibold">Ejemplo: {example}</p>}
      <p className="text-xs leading-5 text-neutral-500">El descuento baja solo el precio de la entrada. <b>El cargo por servicio de ENPASS no cambia</b>: se calcula siempre sobre el precio original{kind === "free" ? ", salvo en el 100%, que se emite como cortesía y no lleva cargo" : ""}.</p>
    </section>

    <section className="card grid gap-4 p-5 sm:p-6">
      <h2 className="text-lg font-black">¿Dónde se puede usar?</h2>
      <label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input type="checkbox" name="allEvents" checked={allEvents} onChange={(event) => setAllEvents(event.target.checked)} className="size-4 accent-[var(--accent)]"/>Todos mis eventos (también los que cree después)</label>
      {!allEvents && <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-semibold">Eventos</legend>
        {events.length ? events.map((event) => <label key={event.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-[var(--border)] px-3.5 text-sm">
          <input type="checkbox" name="eventIds" value={event.id} checked={eventIds.includes(event.id)} onChange={() => toggleEvent(event.id)} className="size-4 accent-[var(--accent)]"/>
          <span className="min-w-0 flex-1 truncate font-semibold">{event.name}</span>
          <span className="shrink-0 text-xs text-neutral-500">{new Date(event.starts_at).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })}</span>
        </label>) : <p className="text-sm text-neutral-500">Todavía no tenés eventos. Creá uno primero.</p>}
      </fieldset>}
      {visibleTypes.length > 0 && <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-semibold">Entradas que incluye <span className="font-normal text-neutral-500">(si no marcás ninguna, vale para todas)</span></legend>
        {visibleTypes.map((type) => <label key={type.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-[var(--border)] px-3.5 text-sm">
          <input type="checkbox" name="ticketTypeIds" value={type.id} checked={ticketTypeIds.includes(type.id)} onChange={() => setTicketTypeIds((current) => current.includes(type.id) ? current.filter((value) => value !== type.id) : [...current, type.id])} className="size-4 accent-[var(--accent)]"/>
          <span className="min-w-0 flex-1 truncate"><b>{type.name}</b>{!allEvents && eventIds.length > 1 && <span className="text-neutral-500"> · {eventName(type.eventId)}</span>}</span>
          <span className="shrink-0 text-xs text-neutral-500">{type.price === 0 ? "Gratis" : money(type.price)}</span>
        </label>)}
      </fieldset>}
      <p className="text-xs leading-5 text-neutral-500">Los cupones aplican a entradas. Las mesas y los asientos no se descuentan.</p>
    </section>

    <section className="card grid gap-4 p-5 sm:p-6">
      <h2 className="text-lg font-black">Condiciones y límites <span className="text-sm font-normal text-neutral-500">(todos opcionales)</span></h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="label">Empieza<input className="field" name="startsAt" type="datetime-local" defaultValue={initial?.startsAtLocal}/></label>
        <label className="label">Termina<input className="field" name="endsAt" type="datetime-local" defaultValue={initial?.endsAtLocal}/></label>
        <label className="label">Usos máximos en total<input className="field" name="maxTotalUses" type="number" inputMode="numeric" min="1" defaultValue={promotion?.max_total_uses ?? ""} placeholder="Sin límite"/><span className="text-xs font-normal text-neutral-500">Cada compra cuenta como un uso.</span></label>
        <label className="label">Usos máximos por comprador<input className="field" name="maxUsesPerBuyer" type="number" inputMode="numeric" min="1" defaultValue={promotion?.max_uses_per_buyer ?? ""} placeholder="Sin límite"/></label>
        <label className="label">{kind === "free" ? "Entradas por compra (máximo)" : "Máximo de entradas beneficiadas por compra"}<input className="field" name="maxTicketsBenefited" type="number" inputMode="numeric" min="1" defaultValue={promotion?.max_tickets_benefited ?? (kind === "free" ? 1 : "")} placeholder="Sin límite" required={kind === "free"}/><span className="text-xs font-normal text-neutral-500">Se descuentan primero las entradas más caras.</span></label>
        <label className="label">Mínimo de entradas para aplicar<input className="field" name="minTickets" type="number" inputMode="numeric" min="1" defaultValue={promotion?.min_tickets && promotion.min_tickets > 1 ? promotion.min_tickets : ""} placeholder="1"/></label>
        <label className="label sm:col-span-2">Tope de descuento por compra (en pesos)<input className="field" name="maxDiscountPesos" type="number" inputMode="decimal" min="0.01" step="0.01" defaultValue={pesos(promotion?.max_discount_amount)} placeholder="Sin tope"/></label>
      </div>
      <p className="text-xs leading-5 text-neutral-500">Por ahora se usa en la venta online del evento. Un solo código por compra.</p>
    </section>

    <ActionMessage message={state.error}/>
    <div className="flex flex-wrap items-center gap-3">
      <SubmitButton className="btn btn-primary min-h-12 px-6">{promotion ? "Guardar cambios" : "Crear promoción"}</SubmitButton>
      <a className="btn btn-ghost" href={promotion ? `/app/marketing/cupones/${promotion.id}` : "/app/marketing/cupones"}>Cancelar</a>
    </div>
  </form>;
}
