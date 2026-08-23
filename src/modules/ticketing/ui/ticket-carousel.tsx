"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Expand, MapPin, ShieldCheck, X } from "lucide-react";
import { EventCover } from "@/modules/events/ui/event-cover";
import type { TicketPresentation } from "../application/queries";
import { formatEventDate } from "@/shared/lib/format";

export function TicketCarousel({ tickets }: { tickets: TicketPresentation[] }) {
  const [index, setIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const ticket = tickets[index];

  useEffect(() => {
    if (!fullscreen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [fullscreen]);

  if (!ticket) return null;
  const hasMultiple = tickets.length > 1;
  const status = statusContent(ticket.status);

  return <>
    <section className="ticket-shell overflow-hidden">
      <EventCover src={ticket.eventCoverUrl} alt={`Flyer de ${ticket.eventName}`} className="aspect-[16/8]" priority/>
      <div className="p-5 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div><p className="eyebrow">{hasMultiple ? "Tus entradas" : "Tu entrada"}</p><h2 className="mt-2 text-3xl font-black tracking-[-.045em]">{ticket.eventName}</h2></div>
          {hasMultiple && <span className="shrink-0 rounded-full bg-white/[.06] px-3 py-1.5 text-xs font-bold text-neutral-300">{index + 1} de {tickets.length}</span>}
        </div>
        <p className="mt-3 text-sm text-neutral-400">{formatEventDate(ticket.startsAt, ticket.timezone)}</p>
        <p className="mt-2 flex items-start gap-2 text-sm text-neutral-500"><MapPin className="mt-0.5 shrink-0" size={15}/><span>{ticket.venueName} · {ticket.venueAddress}</span></p>

        <div className="mt-6 rounded-[1.35rem] bg-white p-4 text-[#090909] sm:p-6">
          {ticket.status === "valid" && ticket.qrSvg ? <>
            <div className="ticket-qr mx-auto aspect-square w-full max-w-[360px]" aria-label={`Código QR de la entrada ${ticket.shortCode}`} dangerouslySetInnerHTML={{ __html: ticket.qrSvg }}/>
            <button type="button" className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0b0b0c] px-4 font-extrabold text-white" onClick={() => setFullscreen(true)}><Expand size={18}/> Ver QR grande</button>
          </> : <div className="grid min-h-72 place-items-center px-5 text-center"><div><status.icon className="mx-auto" size={36}/><h3 className="mt-4 text-xl font-black">{status.title}</h3><p className="mt-2 text-sm leading-6 text-neutral-600">{status.description}</p></div></div>}
        </div>

        <div className="mt-6 flex items-end justify-between gap-4 border-t border-white/[.08] pt-5">
          <div><p className="text-[11px] font-bold uppercase tracking-[.12em] text-neutral-600">{ticket.ticketTypeName}</p><p className="mt-2 text-lg font-extrabold">{ticket.holderName}</p><p className="mt-1 font-mono text-sm tracking-[.12em] text-neutral-500">#{ticket.shortCode}</p></div>
          <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${ticket.status === "valid" ? "bg-[var(--accent)] text-black" : "bg-white/[.07] text-neutral-300"}`}>{status.label}</span>
        </div>
        {ticket.status === "valid" && <p className="mt-5 flex items-center gap-2 text-xs leading-5 text-neutral-500"><ShieldCheck size={15} className="shrink-0 text-[var(--accent)]"/> Presentá este QR en el ingreso. El código corto sirve como referencia de soporte.</p>}
      </div>
    </section>

    {hasMultiple && <nav aria-label="Cambiar entrada" className="mt-4 flex items-center justify-between gap-3">
      <button aria-label="Entrada anterior" type="button" className="btn btn-secondary flex-1" disabled={index === 0} onClick={() => setIndex((current) => current - 1)}><ChevronLeft size={18}/> Anterior</button>
      <div className="flex max-w-[40%] gap-1.5 overflow-hidden" aria-hidden>{tickets.map((item, itemIndex) => <span key={item.shortCode} className={`h-1.5 rounded-full transition-all ${itemIndex === index ? "w-6 bg-[var(--accent)]" : "w-1.5 bg-white/20"}`}/>)}</div>
      <button aria-label="Entrada siguiente" type="button" className="btn btn-secondary flex-1" disabled={index === tickets.length - 1} onClick={() => setIndex((current) => current + 1)}>Siguiente <ChevronRight size={18}/></button>
    </nav>}

    {fullscreen && ticket.qrSvg && <div className="fixed inset-0 z-[100] overflow-y-auto bg-white text-black" role="dialog" aria-modal="true" aria-label={`QR grande, entrada ${index + 1} de ${tickets.length}`}>
      <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-5 py-5">
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.14em] text-neutral-500">{index + 1} de {tickets.length}</p><h2 className="mt-1 text-2xl font-black tracking-[-.035em]">{ticket.eventName}</h2><p className="mt-1 text-sm font-semibold text-neutral-500">{ticket.ticketTypeName}</p></div><button autoFocus aria-label="Cerrar QR grande" type="button" className="grid size-12 shrink-0 place-items-center rounded-full bg-neutral-100" onClick={() => setFullscreen(false)}><X size={22}/></button></div>
        <div className="my-auto py-6"><div className="ticket-qr mx-auto aspect-square w-full" dangerouslySetInnerHTML={{ __html: ticket.qrSvg }}/><div className="mt-4 text-center"><p className="font-mono text-lg font-black tracking-[.12em]">#{ticket.shortCode}</p><p className="mt-2 text-sm font-semibold text-neutral-500">{ticket.holderName}</p></div></div>
        <p className="text-center text-xs font-semibold text-neutral-500">Mantené el código completo visible al acercarte al ingreso.</p>
      </div>
    </div>}
  </>;
}

function statusContent(status: TicketPresentation["status"]) {
  if (status === "refunded") return { label: "Reembolsada", title: "Entrada reembolsada", description: "Este QR ya no es válido.", icon: ShieldCheck };
  if (status === "cancelled") return { label: "Cancelada", title: "Entrada cancelada", description: "Esta credencial ya no permite el ingreso.", icon: ShieldCheck };
  return { label: "Válida", title: "Entrada válida", description: "", icon: ShieldCheck };
}
