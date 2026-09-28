"use client";

import { useState } from "react";
import { createMembershipDue } from "../application/actions";

/** Same rule as public.membership_due_date_for_period: due on the same day-of-month as the
 * member's alta, clamped to the last day of the period's month when it's shorter. */
function defaultDuePeriod(startsAt: string) {
  const now = new Date();
  const period = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const startDay = new Date(`${startsAt}T00:00:00`).getDate();
  const lastDayOfPeriod = new Date(period.getFullYear(), period.getMonth() + 1, 0).getDate();
  const dueDate = new Date(period.getFullYear(), period.getMonth(), Math.min(startDay, lastDayOfPeriod));
  const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { period: toIso(period), dueDate: toIso(dueDate) };
}

export function NewDueForm({ membershipId, defaultAmount, startsAt }: { membershipId: string; defaultAmount: number; startsAt: string }) {
  const [open, setOpen] = useState(false);
  const { period, dueDate } = defaultDuePeriod(startsAt);
  if (!open) return <button className="btn btn-secondary" onClick={() => setOpen(true)}>Generar cuota</button>;
  return <form action={createMembershipDue} className="grid gap-3 rounded-xl border border-white/[.08] p-4">
    <input type="hidden" name="membershipId" value={membershipId}/>
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="label">Período<input className="field" name="period" type="date" defaultValue={period} required/></label>
      <label className="label">Vence<input className="field" name="dueDate" type="date" defaultValue={dueDate} required/></label>
      <label className="label">Monto<input className="field" name="amount" type="number" min="0" step="0.01" defaultValue={(defaultAmount / 100).toString()} required/></label>
    </div>
    <p className="text-xs text-neutral-500">Por defecto vence el mismo día del mes en que se dio de alta el socio — lo podés cambiar si hace falta.</p>
    <div className="flex gap-2"><button className="btn btn-primary" type="submit">Generar</button><button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Cancelar</button></div>
  </form>;
}
