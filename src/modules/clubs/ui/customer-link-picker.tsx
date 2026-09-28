"use client";

import { useActionState, useState } from "react";
import { Search, UserRoundCheck, X } from "lucide-react";
import { searchCustomersForClub, type CustomerSearchState } from "../application/actions";
import type { CustomerCandidate } from "../domain/club";

export function CustomerLinkPicker({ organizationId, onSelect, onClear, selected }: {
  organizationId: string;
  onSelect: (candidate: CustomerCandidate) => void;
  onClear: () => void;
  selected: CustomerCandidate | null;
}) {
  const [state, action] = useActionState<CustomerSearchState, FormData>(searchCustomersForClub, { results: [] });
  const [searching, setSearching] = useState(false);

  if (selected) {
    return <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--accent)]/25 bg-[var(--accent)]/[.06] px-4 py-3">
      <div className="flex items-center gap-2 text-sm"><UserRoundCheck className="text-[var(--accent)]" size={17}/><span><strong>{selected.firstName} {selected.lastName}</strong> · {selected.email}{selected.document ? ` · DNI ${selected.document}` : ""}</span></div>
      <button type="button" className="btn btn-secondary" onClick={onClear}><X size={15}/>Cambiar</button>
    </div>;
  }

  if (!searching) return <button type="button" className="btn btn-secondary w-fit" onClick={() => setSearching(true)}><Search size={16}/>Buscar entre clientes que ya compraron</button>;

  return <div className="rounded-xl border border-white/[.08] p-4">
    <form action={action} className="flex gap-2">
      <input type="hidden" name="organizationId" value={organizationId}/>
      <input className="field" name="query" placeholder="Nombre, email o DNI…" autoFocus/>
      <button className="btn btn-secondary" type="submit">Buscar</button>
      <button type="button" className="btn btn-ghost" onClick={() => setSearching(false)}>Cerrar</button>
    </form>
    {state.error && <p className="mt-3 text-sm text-red-400">{state.error}</p>}
    {state.results.length > 0 && <div className="mt-4 grid gap-2">
      {state.results.map((c) => <div key={c.customerId} className="flex items-center justify-between gap-3 rounded-lg border border-white/[.06] px-3 py-2 text-sm">
        <span>{c.firstName} {c.lastName} · {c.email}{c.document ? ` · DNI ${c.document}` : ""}</span>
        {c.alreadyMember
          ? <span className="text-xs font-bold text-neutral-500">Ya es socio</span>
          : <button type="button" className="btn btn-secondary" onClick={() => { onSelect(c); setSearching(false); }}>Vincular</button>}
      </div>)}
    </div>}
  </div>;
}
