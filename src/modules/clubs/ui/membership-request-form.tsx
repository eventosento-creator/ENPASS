"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import { submitMembershipRequest, type MembershipRequestState } from "../application/public-actions";
import type { PublicClubCategory, PublicClubDivision } from "../domain/club";
import { PLAN_SELECT_EVENT, type PlanSelection } from "./plan-selection";
import { ActionMessage } from "@/shared/ui/action-message";
import { SubmitButton } from "@/shared/ui/submit-button";
import { formatMoney } from "@/shared/lib/format";

export function MembershipRequestForm({ organizationId, categories, divisions = [], currency = "ARS" }: { organizationId: string; categories: PublicClubCategory[]; divisions?: PublicClubDivision[]; currency?: string }) {
  const [state, action] = useActionState<MembershipRequestState, FormData>(submitMembershipRequest, {});
  const [categoryId, setCategoryId] = useState("");
  const [divisionId, setDivisionId] = useState("");
  const [chosen, setChosen] = useState<PlanSelection | null>(null);
  const firstName = useRef<HTMLInputElement>(null);

  // Al tocar una modalidad en "Categorías y cuotas": completa categoría/división, baja al formulario y deja el cursor en el nombre.
  useEffect(() => {
    const onSelect = (event: Event) => {
      const selection = (event as CustomEvent<PlanSelection>).detail;
      setChosen(selection);
      if (selection.categoryId) setCategoryId(selection.categoryId);
      setDivisionId(selection.divisionId ?? "");
      document.getElementById("asociarme")?.scrollIntoView({ behavior: "smooth", block: "start" });
      window.setTimeout(() => firstName.current?.focus({ preventScroll: true }), 450);
    };
    window.addEventListener(PLAN_SELECT_EVENT, onSelect);
    return () => window.removeEventListener(PLAN_SELECT_EVENT, onSelect);
  }, []);

  if (state.success) return <div className="mt-5 flex items-start gap-3 rounded-xl border border-lime-300/20 bg-lime-300/[.06] p-4 text-sm text-lime-200">
    <CheckCircle2 className="mt-0.5 shrink-0" size={18}/>
    <p>Listo, mandamos tu solicitud. El club la va a revisar y te va a contactar por email.</p>
  </div>;

  // Divisiones que se pueden elegir: las de la categoría elegida y las que no tienen categoría.
  const available = divisions.filter((division) => !division.categoryId || division.categoryId === categoryId);
  const selectedDivision = divisions.find((division) => division.id === divisionId);
  const selectedCategory = categories.find((category) => category.id === categoryId);

  return <form action={action} className="mt-5 grid gap-4">
    <input type="hidden" name="organizationId" value={organizationId}/>
    <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden"><label>No completar este campo<input name="website" tabIndex={-1} autoComplete="off" defaultValue=""/></label></div>
    {chosen && <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--accent)]/25 bg-[var(--accent)]/[.05] p-3.5 text-sm" role="status">
      <p><span className="text-neutral-500">Te anotás en </span><b>{chosen.label}</b>{chosen.fee > 0 && <span className="text-neutral-500"> · {formatMoney(chosen.fee, currency)}/mes</span>}</p>
      <button type="button" aria-label="Quitar selección" onClick={() => { setChosen(null); setDivisionId(""); }} className="grid size-8 shrink-0 place-items-center rounded-full text-neutral-500 hover:bg-[var(--surface-strong)]"><X size={15}/></button>
    </div>}
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="label">Nombre<input ref={firstName} className="field" name="firstName" required maxLength={80}/></label>
      <label className="label">Apellido<input className="field" name="lastName" required maxLength={80}/></label>
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="label">Email<input className="field" name="email" type="email" required maxLength={160}/></label>
      <label className="label">Teléfono (opcional)<input className="field" name="phone" maxLength={30}/></label>
    </div>
    <label className="label">Categoría<select className="field" name="categoryId" required value={categoryId} onChange={(event) => { setCategoryId(event.target.value); setDivisionId(""); setChosen(null); }}>
      <option value="" disabled>Elegí una categoría</option>
      {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
    </select></label>
    {divisions.length > 0 && <label className="label">División <span className="font-normal text-neutral-500">(opcional)</span><select className="field" name="divisionId" value={divisionId} onChange={(event) => { setDivisionId(event.target.value); setChosen(null); }}>
      <option value="">{available.length ? "Sin elegir todavía" : "Esta categoría no tiene divisiones"}</option>
      {available.map((division) => <option key={division.id} value={division.id}>{division.name}{division.monthlyFeeAmount > 0 ? ` · ${formatMoney(division.monthlyFeeAmount, currency)}/mes` : ""}</option>)}
    </select></label>}
    {(selectedCategory || selectedDivision) && !chosen && <p className="text-xs text-neutral-500">Vas a anotarte en {[selectedCategory?.name, selectedDivision?.name].filter(Boolean).join(" · ")}.</p>}
    <label className="label">Mensaje (opcional)<textarea className="field min-h-20" name="message" maxLength={500} placeholder="Contanos algo más si querés"/></label>
    <ActionMessage message={state.error}/>
    <SubmitButton className="btn btn-primary w-fit">Enviar solicitud</SubmitButton>
  </form>;
}
