"use client";

import { useState } from "react";
import { Pencil, Plus, X } from "lucide-react";
import { formatMoney } from "@/shared/lib/format";
import { toggleCategoryActive } from "../application/actions";
import { CategoryForm } from "./category-form";
import { EmptyState } from "@/shared/ui/empty-state";
import type { MembershipCategory } from "@/shared/database/types";
import { UserRoundCheck } from "lucide-react";

export function CategoriesManager({ organizationId, categories, currency }: { organizationId: string; categories: MembershipCategory[]; currency: string }) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<MembershipCategory | null>(null);
  return <>
    <div className="mt-6 flex items-center justify-between"><p className="text-sm text-neutral-500">Cada categoría define la cuota mensual de sus socios.</p><button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={18}/>Nueva categoría</button></div>
    <div className="mt-6">{categories.length ? <div className="grid gap-3">
      {categories.map((category) => <div key={category.id} className="card flex items-center justify-between gap-4 p-4">
        <div><p className="font-bold">{category.name}</p><p className="mt-1 text-sm text-neutral-500">{category.monthly_fee_amount > 0 ? `${formatMoney(category.monthly_fee_amount, currency)} / mes` : "Sin cuota propia · el precio lo tienen sus divisiones"}</p></div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${category.active ? "status-success" : "text-neutral-500"}`}>{category.active ? "Activa" : "Inactiva"}</span>
          <button className="btn btn-secondary" onClick={() => setEditing(category)}><Pencil size={15}/></button>
          <form action={toggleCategoryActive}>
            <input type="hidden" name="organizationId" value={organizationId}/>
            <input type="hidden" name="id" value={category.id}/>
            <input type="hidden" name="name" value={category.name}/>
            <input type="hidden" name="monthlyFeeAmount" value={category.monthly_fee_amount}/>
            <input type="hidden" name="nextActive" value={String(!category.active)}/>
            <button className="btn btn-ghost" type="submit">{category.active ? "Desactivar" : "Activar"}</button>
          </form>
        </div>
      </div>)}
    </div> : <EmptyState icon={UserRoundCheck} title="Todavía no tenés categorías" description="Creá al menos una para poder dar de alta socios." action={<button className="btn btn-primary" onClick={() => setCreating(true)}>Nueva categoría</button>}/>}</div>

    {creating && <div className="fixed inset-0 z-50 bg-black/70 p-3 backdrop-blur-sm sm:grid sm:place-items-center" role="dialog" aria-modal="true"><div className="ml-auto h-full w-full max-w-md overflow-y-auto rounded-[1.4rem] border border-white/10 bg-[var(--surface)] p-5 shadow-2xl sm:mx-auto sm:h-auto sm:p-7"><div className="mb-6 flex items-center justify-between"><h2 className="text-xl font-black">Nueva categoría</h2><button className="grid size-10 place-items-center rounded-full bg-white/[.06]" onClick={() => setCreating(false)} aria-label="Cerrar"><X size={18}/></button></div><CategoryForm organizationId={organizationId} onSaved={() => setCreating(false)}/></div></div>}
    {editing && <div className="fixed inset-0 z-50 bg-black/70 p-3 backdrop-blur-sm sm:grid sm:place-items-center" role="dialog" aria-modal="true"><div className="ml-auto h-full w-full max-w-md overflow-y-auto rounded-[1.4rem] border border-white/10 bg-[var(--surface)] p-5 shadow-2xl sm:mx-auto sm:h-auto sm:p-7"><div className="mb-6 flex items-center justify-between"><h2 className="text-xl font-black">Editar categoría</h2><button className="grid size-10 place-items-center rounded-full bg-white/[.06]" onClick={() => setEditing(null)} aria-label="Cerrar"><X size={18}/></button></div><CategoryForm organizationId={organizationId} category={editing} onSaved={() => setEditing(null)}/></div></div>}
  </>;
}
