"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { formatMoney } from "@/shared/lib/format";
import { dueStatusLabels, type MembershipDivisionRow } from "../domain/club";
import { enrollMembershipInDivision, type ClubActionState } from "../application/actions";

const statusTone: Record<string, string> = { paid: "status-success", pending: "text-neutral-500", overdue: "status-danger" };

function EnrollForm({ membershipId, divisionId, onClose }: { membershipId: string; divisionId: string; onClose: () => void }) {
  const [state, action] = useActionState<ClubActionState, FormData>(enrollMembershipInDivision, {});
  if (state.success) { onClose(); return null; }
  return <form action={action} className="flex items-center gap-2">
    <input type="hidden" name="membershipId" value={membershipId}/>
    <input type="hidden" name="divisionId" value={divisionId}/>
    <button className="btn btn-secondary" type="submit">Anotar</button>
    {state.error && <span className="text-xs text-red-400">{state.error}</span>}
  </form>;
}

export function MembershipDivisionsCard({ membershipId, divisions, available, currency }: {
  membershipId: string;
  divisions: MembershipDivisionRow[];
  available: { divisionId: string; name: string; monthlyFeeAmount: number }[];
  currency: string;
}) {
  const [adding, setAdding] = useState(false);
  return <section className="card mt-6 p-5 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">Divisiones</h2>{available.length > 0 && <button className="btn btn-secondary" onClick={() => setAdding((v) => !v)}>{adding ? "Cerrar" : "Anotar a división"}</button>}</div>

    {adding && <div className="mt-4 grid gap-2">
      {available.map((d) => <div key={d.divisionId} className="flex items-center justify-between gap-3 rounded-lg border border-white/[.06] px-3 py-2 text-sm">
        <span>{d.name} · {formatMoney(d.monthlyFeeAmount, currency)}/mes</span>
        <EnrollForm membershipId={membershipId} divisionId={d.divisionId} onClose={() => setAdding(false)}/>
      </div>)}
    </div>}

    <div className="mt-4 grid gap-2">
      {divisions.length ? divisions.map((d) => <Link key={d.enrollmentId} href={`/app/socios/divisiones/${d.divisionId}` as never} className="card card-interactive flex items-center justify-between gap-3 p-3">
        <span className="font-semibold">{d.divisionName}</span>
        <div className="flex items-center gap-2">
          {d.dueStatus && <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${statusTone[d.dueStatus]}`}>{dueStatusLabels[d.dueStatus]}</span>}
          <span className="text-sm text-neutral-500">{formatMoney(d.monthlyFeeAmount, currency)}/mes</span>
        </div>
      </Link>) : <p className="text-sm text-neutral-500">No está anotado en ninguna división.</p>}
    </div>
  </section>;
}
