"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { dueStatusLabels, membershipStatusLabels, type MemberRow } from "../domain/club";

const statusTone: Record<string, string> = {
  active: "status-success", suspended: "status-danger", cancelled: "text-neutral-500",
};
const dueTone: Record<string, string> = {
  paid: "status-success", pending: "text-neutral-500", overdue: "status-danger",
};

export function MemberSearch({ members }: { members: MemberRow[] }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) =>
      `${m.firstName} ${m.lastName}`.toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q) ||
      m.memberNumber.toLowerCase().includes(q) ||
      (m.document ?? "").toLowerCase().includes(q));
  }, [members, query]);

  return <div className="mt-6">
    <div className="relative"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" size={17}/><input className="field pl-11" placeholder="Buscar por nombre, DNI, email o número de socio…" value={query} onChange={(e) => setQuery(e.target.value)}/></div>
    <div className="mt-5 grid gap-3">
      {filtered.map((m) => <Link key={m.membershipId} href={`/app/socios/${m.membershipId}` as never} className="card card-interactive flex items-center justify-between gap-4 p-4">
        <div className="min-w-0"><p className="truncate font-bold">{m.firstName} {m.lastName}</p><p className="mt-0.5 text-xs text-neutral-500">N° {m.memberNumber} · {m.categoryName} · {m.document ?? "sin DNI"}</p></div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${statusTone[m.membershipStatus]}`}>{membershipStatusLabels[m.membershipStatus]}</span>
          {m.dueStatus && <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${dueTone[m.dueStatus]}`}>{dueStatusLabels[m.dueStatus]}</span>}
        </div>
      </Link>)}
      {!filtered.length && <p className="py-8 text-center text-sm text-neutral-500">No encontramos socios con ese criterio.</p>}
    </div>
  </div>;
}
