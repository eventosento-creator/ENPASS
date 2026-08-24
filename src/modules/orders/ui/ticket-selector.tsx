"use client";

import Link from "next/link";
import { Minus, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import type { TicketType } from "@/shared/database/types";
import { formatMoney } from "@/shared/lib/format";

type PublicTicketType = Omit<TicketType, "publicly_available"> & { available_quantity: number; sale_open: boolean };
export function TicketSelector({ eventSlug, ticketTypes }: { eventSlug: string; ticketTypes: PublicTicketType[] }) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const selected = useMemo<Array<{ ticket_type_id: string; quantity: number }>>(() => ticketTypes.flatMap(t => quantities[t.id] ? [{ ticket_type_id: t.id, quantity: quantities[t.id]! }] : []), [quantities, ticketTypes]);
  const total = ticketTypes.reduce((sum, t) => sum + t.price_amount * (quantities[t.id] ?? 0), 0);
  function change(type: PublicTicketType, delta: number) { if (!type.sale_open) return; setQuantities(q => ({ ...q, [type.id]: Math.max(0, Math.min(type.max_per_order, type.available_quantity, (q[type.id] ?? 0) + delta)) })); }
  const ticketCount = selected.reduce((sum, item) => sum + item.quantity, 0);
  return <div>{ticketTypes.map(type => { const soldOut = type.available_quantity === 0; return <article className={`border-b border-white/[.07] py-5 first:pt-2 last:border-0 ${!type.sale_open ? "opacity-55" : ""}`} key={type.id}><div className="flex items-end justify-between gap-4"><div className="min-w-0"><h3 className="font-black tracking-[-.01em]">{type.name}</h3>{type.description && <p className="mt-1 text-xs text-neutral-500">{type.description}</p>}<p className="mt-3 text-lg font-black">{formatMoney(type.price_amount, type.currency)}</p><p className={`mt-1 text-xs font-semibold ${soldOut ? "text-red-300" : type.sale_open ? "text-neutral-500" : "text-neutral-600"}`}>{soldOut ? "Agotada" : type.sale_open ? type.available_quantity <= 20 ? `Últimas ${type.available_quantity}` : `${type.available_quantity} disponibles` : "Próximamente"}</p></div><div className="flex shrink-0 items-center gap-2"><button type="button" disabled={!type.sale_open || (quantities[type.id] ?? 0) === 0} aria-label={`Quitar ${type.name}`} className="grid size-11 place-items-center rounded-full border border-white/10 bg-white/[.04] disabled:opacity-25" onClick={() => change(type, -1)}><Minus size={17}/></button><span className="w-7 text-center text-lg font-black" aria-live="polite">{quantities[type.id] ?? 0}</span><button type="button" disabled={!type.sale_open || (quantities[type.id] ?? 0) >= Math.min(type.max_per_order, type.available_quantity)} aria-label={`Agregar ${type.name}`} className="grid size-11 place-items-center rounded-full bg-white text-black disabled:bg-white/10 disabled:text-white/25" onClick={() => change(type, 1)}><Plus size={17}/></button></div></div></article>; })}
    <div className={`${selected.length ? "sticky bottom-2 z-10 sticky-action" : ""} mt-4`}><Link aria-disabled={!selected.length} className={`btn min-h-14 w-full shadow-2xl ${selected.length ? "btn-primary" : "pointer-events-none border border-white/[.08] bg-[#202023] text-white/30"}`} href={selected.length ? `/e/${eventSlug}/checkout?selection=${encodeURIComponent(JSON.stringify(selected))}` : `/e/${eventSlug}`}>{selected.length ? `${ticketCount} ${ticketCount === 1 ? "entrada" : "entradas"} · ${formatMoney(total)}` : "Elegí tus entradas"}</Link></div>
  </div>;
}
