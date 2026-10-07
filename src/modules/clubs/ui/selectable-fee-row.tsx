"use client";

import { ChevronRight } from "lucide-react";
import { PLAN_SELECT_EVENT, type PlanSelection } from "./plan-selection";
import { formatMoney } from "@/shared/lib/format";

/** Fila de modalidad con su precio. Si se puede elegir, al tocarla se completa el formulario para anotarse. */
export function SelectableFeeRow({ label, fee, currency, selection, selectable }: { label: string; fee: number; currency: string; selection: PlanSelection; selectable: boolean }) {
  const price = fee > 0
    ? <span className="shrink-0 text-lg font-black tracking-[-.01em]">{formatMoney(fee, currency)}<span className="text-sm font-normal text-neutral-500">/mes</span></span>
    : <span className="shrink-0 text-sm font-semibold text-neutral-500">Sin cuota adicional</span>;
  if (!selectable) return <li className="flex items-center justify-between gap-4 py-3.5"><span className="font-semibold">{label}</span>{price}</li>;
  return <li>
    <button type="button" onClick={() => window.dispatchEvent(new CustomEvent<PlanSelection>(PLAN_SELECT_EVENT, { detail: selection }))}
      className="-mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-xl px-2 py-3.5 text-left transition hover:bg-[var(--surface-raised)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]" aria-label={`Anotarme en ${label}`}>
      <span className="font-semibold">{label}</span>
      <span className="flex items-center gap-2">{price}<ChevronRight aria-hidden size={16} className="shrink-0 text-neutral-500"/></span>
    </button>
  </li>;
}
