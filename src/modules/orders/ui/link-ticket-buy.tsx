"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { formatMoney } from "@/shared/lib/format";

// Refreshes the page when the sale window opens, so the buyer never has to reload by hand.
export function LinkTicketBuy({ slug, ticketId, token, name, priceAmount, currency, maxQuantity, salesStart, state }: {
  slug: string; ticketId: string; token: string; name: string; priceAmount: number; currency: string;
  maxQuantity: number; salesStart: string | null; state: "upcoming" | "open" | "ended" | "sold_out";
}) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    if (state !== "upcoming") return;
    const wait = salesStart ? new Date(salesStart).getTime() - Date.now() : 30_000;
    const timer = setTimeout(() => router.refresh(), Math.min(Math.max(wait + 500, 1_000), 60_000));
    return () => clearTimeout(timer);
  }, [state, salesStart, router]);

  if (state !== "open") {
    const message = state === "upcoming" ? "Todavía no está habilitada. Esta página se actualiza sola cuando se abre la venta."
      : state === "ended" ? "La venta de esta entrada ya terminó." : "Se agotaron las entradas.";
    return <p className="mt-6 rounded-xl border border-white/[.08] bg-white/[.035] p-4 text-sm text-neutral-500">{message}</p>;
  }
  const selection = JSON.stringify([{ item_type: "ticket", item_id: ticketId, quantity, link_token: token }]);
  return <div className="mt-6 grid gap-4">
    <div className="flex items-center justify-between rounded-xl border border-white/[.08] p-4">
      <div><p className="font-bold">{name}</p><p className="text-sm text-neutral-500">{formatMoney(priceAmount, currency)} c/u + cargo de servicio</p></div>
      <div className="flex items-center gap-1"><button type="button" className="grid size-11 place-items-center rounded-xl border border-white/[.1]" onClick={() => setQuantity((current) => Math.max(1, current - 1))} aria-label="Menos"><Minus size={16}/></button><span className="w-10 text-center text-xl font-black">{quantity}</span><button type="button" className="grid size-11 place-items-center rounded-xl border border-white/[.1]" onClick={() => setQuantity((current) => Math.min(maxQuantity, current + 1))} aria-label="Más"><Plus size={16}/></button></div>
    </div>
    <Link className="btn btn-primary min-h-14" href={`/e/${slug}/checkout?selection=${encodeURIComponent(selection)}` as never}>Comprar {quantity} {quantity === 1 ? "entrada" : "entradas"}</Link>
  </div>;
}
