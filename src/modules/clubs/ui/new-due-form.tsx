"use client";

import { useState } from "react";
import { createMembershipDue } from "../application/actions";

function defaultDuePeriod() {
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const dueDate = new Date(now.getTime() + 10 * 86_400_000).toISOString().slice(0, 10);
  return { period, dueDate };
}

export function NewDueForm({ membershipId, defaultAmount }: { membershipId: string; defaultAmount: number }) {
  const [open, setOpen] = useState(false);
  const { period, dueDate } = defaultDuePeriod();
  if (!open) return <button className="btn btn-secondary" onClick={() => setOpen(true)}>Generar cuota</button>;
  return <form action={createMembershipDue} className="grid gap-3 rounded-xl border border-white/[.08] p-4">
    <input type="hidden" name="membershipId" value={membershipId}/>
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="label">Período<input className="field" name="period" type="date" defaultValue={period} required/></label>
      <label className="label">Vence<input className="field" name="dueDate" type="date" defaultValue={dueDate} required/></label>
      <label className="label">Monto<input className="field" name="amount" type="number" min="0" step="0.01" defaultValue={(defaultAmount / 100).toString()} required/></label>
    </div>
    <div className="flex gap-2"><button className="btn btn-primary" type="submit">Generar</button><button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Cancelar</button></div>
  </form>;
}
