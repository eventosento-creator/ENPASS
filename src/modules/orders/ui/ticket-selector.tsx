"use client";

import Link from "next/link";
import { Minus, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import type { TicketType } from "@/shared/database/types";
import { formatMoney } from "@/shared/lib/format";

type PublicTicketType = Omit<TicketType, "publicly_available" | "link_only" | "link_token"> & { available_quantity: number; sale_open: boolean };
export function TicketSelector({ eventSlug, ticketTypes }: { eventSlug: string; ticketTypes: PublicTicketType[] }) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const selected = useMemo<Array<{ item_type: "ticket"; item_id: string; quantity: number }>>(() => ticketTypes.flatMap(t => quantities[t.id] ? [{ item_type: "ticket" as const, item_id: t.id, quantity: quantities[t.id]! }] : []), [quantities, ticketTypes]);
  const total = ticketTypes.reduce((sum, t) => sum + t.price_amount * (quantities[t.id] ?? 0), 0);
  function change(type: PublicTicketType, delta: number) { if (!type.sale_open) return; setQuantities(q => ({ ...q, [type.id]: Math.max(0, Math.min(type.max_per_order, type.available_quantity, (q[type.id] ?? 0) + delta)) })); }
  const ticketCount = selected.reduce((sum, item) => sum + item.quantity, 0);
  const totalLabel = total === 0 ? "Gratis" : formatMoney(total);
  const href = selected.length ? `/e/${eventSlug}/checkout?selection=${encodeURIComponent(JSON.stringify(selected))}` : `/e/${eventSlug}`;
  return <div>{ticketTypes.map(type => { const soldOut = type.available_quantity === 0; return <article className={`border-b border-[var(--border)] py-5 first:pt-2 last:border-0 ${!type.sale_open ? "opacity-55" : ""}`} key={type.id}><div className="flex items-end justify-between gap-4"><div className="min-w-0"><h3 className="font-black tracking-[-.01em]">{type.name}</h3>{type.description && <p className="mt-1 text-xs text-neutral-500">{type.description}</p>}<p className="mt-3 text-lg font-black">{type.price_amount === 0 ? "Gratis" : formatMoney(type.price_amount, type.currency)}</p><p className={`mt-1 text-xs font-semibold ${soldOut ? "text-red-300" : type.sale_open ? "text-neutral-500" : "text-neutral-600"}`}>{soldOut ? "Agotada" : type.sale_open ? type.available_quantity <= 20 ? `Últimas ${type.available_quantity}` : `${type.available_quantity} disponibles` : "Próximamente"}</p></div><div className="flex shrink-0 items-center gap-2"><button type="button" disabled={!type.sale_open || (quantities[type.id] ?? 0) === 0} aria-label={`Quitar ${type.name}`} className="grid size-11 place-items-center rounded-full border border-[var(--border-strong)] bg-[var(--surface-raised)] disabled:opacity-30" onClick={() => change(type, -1)}><Minus size={17}/></button><span className="w-7 text-center text-lg font-black" aria-live="polite">{quantities[type.id] ?? 0}</span><button type="button" disabled={!type.sale_open || (quantities[type.id] ?? 0) >= Math.min(type.max_per_order, type.available_quantity)} aria-label={`Agregar ${type.name}`} className="grid size-11 place-items-center rounded-full bg-[var(--accent)] text-[var(--on-accent)] disabled:bg-[var(--surface-strong)] disabled:text-[var(--muted)] disabled:opacity-60" onClick={() => change(type, 1)}><Plus size={17}/></button></div></div></article>; })}
    <div className={selected.length ? "max-md:hidden" : ""}><Link aria-disabled={!selected.length} tabIndex={selected.length ? undefined : -1} className={`btn mt-4 min-h-14 w-full ${selected.length ? "btn-primary max-md:hidden" : "pointer-events-none border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--muted)]"}`} href={href as never}>{selected.length ? `Continuar · ${totalLabel} →` : "Seleccioná la cantidad"}</Link></div>
    {selected.length > 0 && <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[var(--surface)] px-4 pt-3 shadow-[0_-8px_30px_rgb(0_0_0/12%)] md:hidden" style={{ paddingBottom: "max(.75rem, env(safe-area-inset-bottom))" }}><div className="mx-auto flex max-w-xl items-center justify-between gap-4"><div><p className="text-sm font-semibold text-[var(--muted)]">{ticketCount} {ticketCount === 1 ? "entrada" : "entradas"}</p><p className="text-xl font-black leading-tight">{totalLabel}</p></div><Link className="btn btn-primary min-h-12 px-7" href={href as never}>Continuar →</Link></div></div>}
  </div>;
}
