"use client";

import { useState } from "react";
import { ArrowLeft, ChevronRight, ShieldCheck, XCircle } from "lucide-react";
import type { TicketPresentation } from "../application/queries";
import { TicketCarousel } from "./ticket-carousel";

export function EventTicketList({ tickets }: { tickets: TicketPresentation[] }) {
  const [selected, setSelected] = useState<number | null>(tickets.length === 1 ? 0 : null);

  if (selected !== null) {
    const ticket = tickets[selected]!;
    return <div>
      {tickets.length > 1 && <button type="button" className="mb-4 inline-flex items-center gap-2 text-sm font-bold text-neutral-500 hover:text-white" onClick={() => setSelected(null)}><ArrowLeft size={16}/>Volver a la lista</button>}
      <TicketCarousel tickets={[ticket]}/>
    </div>;
  }

  return <div className="card overflow-hidden">
    <div className="divide-y divide-white/[.06]">{tickets.map((ticket, index) => <button type="button" key={ticket.shortCode} className="flex w-full items-center justify-between gap-4 p-4 text-left transition hover:bg-white/[.03]" onClick={() => setSelected(index)}>
      <div className="min-w-0"><p className="truncate font-bold">{ticket.holderName}</p><p className="mt-0.5 truncate text-xs text-neutral-500">{ticket.credentialKind === "table" ? `Mesa · ${ticket.ticketTypeName}` : ticket.ticketTypeName} · #{ticket.shortCode}</p></div>
      <div className="flex shrink-0 items-center gap-3">
        {ticket.status === "valid" ? <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)]/10 px-2.5 py-1 text-[10px] font-black uppercase text-[var(--accent)]"><ShieldCheck size={12}/>Válida</span> : <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-black uppercase text-neutral-500"><XCircle size={12}/>{ticket.status === "refunded" ? "Reembolsada" : "Cancelada"}</span>}
        <ChevronRight size={16} className="text-neutral-600"/>
      </div>
    </button>)}</div>
  </div>;
}
