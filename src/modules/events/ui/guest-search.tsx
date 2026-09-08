"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";

export type GuestRow = {
  id: string;
  name: string;
  document: string | null;
  typeLabel: string;
  status: "valid" | "cancelled" | "refunded";
  checkedIn: boolean;
  issuedAt: string;
};

export function GuestSearch({ guests }: { guests: GuestRow[] }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return guests;
    return guests.filter((guest) =>
      guest.name.toLowerCase().includes(normalized) ||
      guest.document?.toLowerCase().includes(normalized) ||
      guest.typeLabel.toLowerCase().includes(normalized));
  }, [guests, query]);

  return <div>
    <label className="field flex items-center gap-2.5 px-4"><Search size={16} className="shrink-0 text-neutral-500"/><input className="min-w-0 flex-1 border-0 bg-transparent p-0 outline-none" placeholder="Buscar por nombre o documento" value={query} onChange={(event) => setQuery(event.target.value)}/></label>
    <p className="mt-3 text-xs font-bold text-neutral-500">{filtered.length} {filtered.length === 1 ? "invitado" : "invitados"}{query && ` de ${guests.length}`}</p>
    <div className="mt-4 card overflow-hidden">
      {filtered.length ? <div className="divide-y divide-white/[.06]">{filtered.map((guest) => <div className="grid gap-2 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-4" key={guest.id}>
        <div><p className="font-bold">{guest.name}</p><p className="mt-0.5 text-xs text-neutral-500">{guest.document ? `DNI ${guest.document} · ` : ""}{guest.typeLabel}</p></div>
        <StatusBadge status={guest.status}/>
        <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${guest.checkedIn ? "status-success" : "border border-white/10 text-neutral-500"}`}><span className={`size-1.5 rounded-full ${guest.checkedIn ? "bg-[var(--success)]" : "bg-neutral-600"}`}/>{guest.checkedIn ? "Ingresó" : "No ingresó"}</span>
      </div>)}</div> : <div className="p-10 text-center text-sm text-neutral-500">No encontramos invitados con esa búsqueda.</div>}
    </div>
  </div>;
}

function StatusBadge({ status }: { status: GuestRow["status"] }) {
  const labels = { valid: "Válida", cancelled: "Cancelada", refunded: "Reembolsada" } as const;
  const tone = status === "valid" ? "status-success" : status === "cancelled" ? "border border-white/10 text-neutral-500" : "status-warning";
  return <span className={`inline-flex w-fit rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${tone}`}>{labels[status]}</span>;
}
