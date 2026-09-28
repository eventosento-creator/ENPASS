"use client";

import { useState } from "react";
import { formatMoney } from "@/shared/lib/format";
import { dueStatusLabels, type MembershipDue } from "../domain/club";
import { DuePaymentForm } from "./due-payment-form";

const statusTone: Record<string, string> = { paid: "status-success", pending: "text-neutral-500", overdue: "status-danger" };
const methodLabels: Record<string, string> = { cash: "Efectivo", transfer: "Transferencia", other: "Otro", mercado_pago: "Mercado Pago" };

export function DuesList({ membershipId, dues, currency }: { membershipId: string; dues: MembershipDue[]; currency: string }) {
  const [openDueId, setOpenDueId] = useState<string | null>(null);
  if (!dues.length) return <p className="py-6 text-center text-sm text-neutral-500">Todavía no hay cuotas generadas para este socio.</p>;
  return <div className="grid gap-3">
    {dues.map((due) => <div key={due.dueId} className="rounded-xl border border-white/[.08] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="font-bold">{new Date(due.period + "T00:00:00").toLocaleDateString("es-AR", { month: "long", year: "numeric" })}</p><p className="mt-0.5 text-xs text-neutral-500">Vence {new Date(due.dueDate + "T00:00:00").toLocaleDateString("es-AR")}{due.paidAt ? ` · Pagada el ${new Date(due.paidAt).toLocaleDateString("es-AR")} (${methodLabels[due.paymentMethod ?? ""] ?? due.paymentMethod})` : ""}</p></div>
        <div className="flex items-center gap-3"><span className="font-bold">{formatMoney(due.amount, currency)}</span><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${statusTone[due.status]}`}>{dueStatusLabels[due.status]}</span>
          {due.status !== "paid" && <button className="btn btn-secondary" onClick={() => setOpenDueId(openDueId === due.dueId ? null : due.dueId)}>Registrar pago</button>}
        </div>
      </div>
      {due.status !== "paid" && openDueId === due.dueId && <DuePaymentForm membershipId={membershipId} dueId={due.dueId} defaultAmount={due.amount} onClose={() => setOpenDueId(null)}/>}
    </div>)}
  </div>;
}
