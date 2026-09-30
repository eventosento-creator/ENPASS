"use client";

import { useActionState, useState } from "react";
import { formatMoney } from "@/shared/lib/format";
import { dueStatusLabels, type DivisionEnrollmentRow } from "../domain/club";
import { loadDivisionDues, removeMembershipFromDivision, createDivisionDue, type DivisionDuesState } from "../application/actions";
import { DivisionDuePaymentForm } from "./division-due-payment-form";
import { DivisionDueOnlineCheckoutButton } from "./division-due-online-checkout-button";

const statusTone: Record<string, string> = { paid: "status-success", pending: "text-neutral-500", overdue: "status-danger" };
const methodLabels: Record<string, string> = { cash: "Efectivo", transfer: "Transferencia", other: "Otro" };

function nextDueDefaults() {
  const now = new Date();
  const period = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10);
  const dueDate = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()).toISOString().slice(0, 10);
  return { period, dueDate };
}

export function DivisionMemberRow({ divisionId, defaultAmount, currency, row }: { divisionId: string; defaultAmount: number; currency: string; row: DivisionEnrollmentRow }) {
  const [duesState, loadDues] = useActionState<DivisionDuesState, FormData>(loadDivisionDues, { dues: [] });
  const [expanded, setExpanded] = useState(false);
  const [payingDueId, setPayingDueId] = useState<string | null>(null);
  const { period, dueDate } = nextDueDefaults();

  return <div className="card p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setExpanded((v) => !v)}>
        <p className="font-bold">{row.firstName} {row.lastName}</p>
        <p className="mt-0.5 text-xs text-neutral-500">N° {row.memberNumber}</p>
      </button>
      <div className="flex items-center gap-2">
        {row.dueStatus && <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${statusTone[row.dueStatus]}`}>{dueStatusLabels[row.dueStatus]}</span>}
        <button type="button" className="btn btn-secondary" onClick={() => setExpanded((v) => !v)}>{expanded ? "Ocultar" : "Ver cuotas"}</button>
        <form action={removeMembershipFromDivision}>
          <input type="hidden" name="enrollmentId" value={row.enrollmentId}/>
          <button type="submit" className="btn btn-ghost text-red-400">Quitar</button>
        </form>
      </div>
    </div>

    {expanded && <div className="mt-4 border-t border-white/[.07] pt-4">
      <form action={loadDues}><input type="hidden" name="enrollmentId" value={row.enrollmentId}/>
        {duesState.dues.length === 0 && <button type="submit" className="btn btn-secondary">Cargar cuotas</button>}
      </form>
      {duesState.dues.length > 0 && <div className="grid gap-3">
        {duesState.dues.map((due) => <div key={due.dueId} className="rounded-xl border border-white/[.08] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><p className="text-sm font-bold">{new Date(`${due.period}T00:00:00`).toLocaleDateString("es-AR", { month: "long", year: "numeric" })}</p><p className="text-xs text-neutral-500">Vence {new Date(`${due.dueDate}T00:00:00`).toLocaleDateString("es-AR")}{due.paidAt ? ` · Pagada (${methodLabels[due.paymentMethod ?? ""] ?? due.paymentMethod})` : ""}</p></div>
            <div className="flex flex-wrap items-center gap-2"><span className="font-bold">{formatMoney(due.amount, currency)}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusTone[due.status]}`}>{dueStatusLabels[due.status]}</span>
              {due.status !== "paid" && <DivisionDueOnlineCheckoutButton dueId={due.dueId}/>}
              {due.status !== "paid" && <button type="button" className="btn btn-secondary" onClick={() => setPayingDueId(payingDueId === due.dueId ? null : due.dueId)}>Registrar pago manual</button>}
            </div>
          </div>
          {payingDueId === due.dueId && <DivisionDuePaymentForm divisionId={divisionId} dueId={due.dueId} defaultAmount={due.amount} onClose={() => setPayingDueId(null)}/>}
        </div>)}
      </div>}
      <form action={createDivisionDue} className="mt-3 flex flex-wrap items-end gap-2">
        <input type="hidden" name="enrollmentId" value={row.enrollmentId}/>
        <input type="hidden" name="divisionId" value={divisionId}/>
        <input type="hidden" name="period" value={period}/>
        <input type="hidden" name="dueDate" value={dueDate}/>
        <input type="hidden" name="amount" value={defaultAmount / 100}/>
        <button type="submit" className="btn btn-ghost">Generar próxima cuota</button>
      </form>
    </div>}
  </div>;
}
