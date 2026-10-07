"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil, Plus, Shield, Users, X } from "lucide-react";
import { formatMoney } from "@/shared/lib/format";
import { toggleDivisionActive } from "../application/actions";
import { DivisionForm } from "./division-form";
import { EmptyState } from "@/shared/ui/empty-state";
import type { DivisionRow } from "../domain/club";

export function DivisionsManager({ organizationId, divisions, categories, currency }: { organizationId: string; divisions: DivisionRow[]; categories: Array<{ id: string; name: string }>; currency: string }) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<DivisionRow | null>(null);
  return <>
    <div className="mt-6 flex items-center justify-between"><p className="text-sm text-neutral-500">Disciplinas o actividades del club, cada una con su propia cuota.</p><button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={18}/>Nueva división</button></div>
    <div className="mt-6">{divisions.length ? <div className="grid gap-3">
      {divisions.map((division) => <div key={division.divisionId} className="card flex items-center justify-between gap-4 p-4">
        <Link href={`/app/socios/divisiones/${division.divisionId}` as never} className="min-w-0 flex-1"><p className="font-bold">{division.name}</p><p className="mt-1 flex items-center gap-3 text-sm text-neutral-500">{division.categoryId && <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] font-bold">{categories.find((category) => category.id === division.categoryId)?.name}</span>}<span>{formatMoney(division.monthlyFeeAmount, currency)} / mes</span><span className="inline-flex items-center gap-1"><Users size={13}/>{division.enrolledCount}</span></p></Link>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${division.active ? "status-success" : "text-neutral-500"}`}>{division.active ? "Activa" : "Inactiva"}</span>
          <button className="btn btn-secondary" onClick={() => setEditing(division)}><Pencil size={15}/></button>
          <form action={toggleDivisionActive}>
            <input type="hidden" name="organizationId" value={organizationId}/>
            <input type="hidden" name="id" value={division.divisionId}/>
            <input type="hidden" name="name" value={division.name}/>
            <input type="hidden" name="monthlyFeeAmount" value={division.monthlyFeeAmount}/>
            <input type="hidden" name="nextActive" value={String(!division.active)}/>
            <button className="btn btn-ghost" type="submit">{division.active ? "Desactivar" : "Activar"}</button>
          </form>
        </div>
      </div>)}
    </div> : <EmptyState icon={Shield} title="Todavía no tenés divisiones" description="Creá una para empezar a anotar socios (ej. Fútbol, Básquet, Natación)." action={<button className="btn btn-primary" onClick={() => setCreating(true)}>Nueva división</button>}/>}</div>

    {creating && <div className="fixed inset-0 z-50 bg-black/70 p-3 backdrop-blur-sm sm:grid sm:place-items-center" role="dialog" aria-modal="true"><div className="ml-auto h-full w-full max-w-md overflow-y-auto rounded-[1.4rem] border border-white/10 bg-[var(--surface)] p-5 shadow-2xl sm:mx-auto sm:h-auto sm:p-7"><div className="mb-6 flex items-center justify-between"><h2 className="text-xl font-black">Nueva división</h2><button className="grid size-10 place-items-center rounded-full bg-white/[.06]" onClick={() => setCreating(false)} aria-label="Cerrar"><X size={18}/></button></div><DivisionForm organizationId={organizationId} categories={categories} onSaved={() => setCreating(false)}/></div></div>}
    {editing && <div className="fixed inset-0 z-50 bg-black/70 p-3 backdrop-blur-sm sm:grid sm:place-items-center" role="dialog" aria-modal="true"><div className="ml-auto h-full w-full max-w-md overflow-y-auto rounded-[1.4rem] border border-white/10 bg-[var(--surface)] p-5 shadow-2xl sm:mx-auto sm:h-auto sm:p-7"><div className="mb-6 flex items-center justify-between"><h2 className="text-xl font-black">Editar división</h2><button className="grid size-10 place-items-center rounded-full bg-white/[.06]" onClick={() => setEditing(null)} aria-label="Cerrar"><X size={18}/></button></div><DivisionForm organizationId={organizationId} division={editing} categories={categories} onSaved={() => setEditing(null)}/></div></div>}
  </>;
}
