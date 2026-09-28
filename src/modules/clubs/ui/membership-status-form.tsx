"use client";

import { useState } from "react";
import { setMembershipStatus } from "../application/actions";
import type { MembershipStatus } from "../domain/club";

export function MembershipStatusForm({ membershipId, currentStatus }: { membershipId: string; currentStatus: MembershipStatus }) {
  const [open, setOpen] = useState<MembershipStatus | null>(null);
  const options: { value: MembershipStatus; label: string }[] = [
    { value: "active", label: "Activar" },
    { value: "suspended", label: "Suspender" },
    { value: "cancelled", label: "Dar de baja" },
  ].filter((o) => o.value !== currentStatus) as { value: MembershipStatus; label: string }[];
  return <div className="flex flex-wrap gap-2">
    {options.map((o) => <button key={o.value} className="btn btn-secondary" onClick={() => setOpen(open === o.value ? null : o.value)}>{o.label}</button>)}
    {open && <form action={setMembershipStatus} className="mt-3 grid w-full gap-3 rounded-xl border border-white/[.08] p-4">
      <input type="hidden" name="membershipId" value={membershipId}/>
      <input type="hidden" name="status" value={open}/>
      <label className="label">Motivo (opcional)<input className="field" name="reason" placeholder="Ej. no pagó hace 3 meses"/></label>
      <div className="flex gap-2"><button className="btn btn-primary" type="submit">Confirmar</button><button type="button" className="btn btn-secondary" onClick={() => setOpen(null)}>Cancelar</button></div>
    </form>}
  </div>;
}
