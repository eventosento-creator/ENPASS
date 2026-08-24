import Link from "next/link";
import { Armchair, Check, UsersRound } from "lucide-react";
import type { Json } from "@/shared/database/types";
import { formatMoney } from "@/shared/lib/format";

export type PublicEventTable = {
  id: string; event_id: string; table_zone_id: string; zone_name: string; name: string; description: string;
  capacity: number; base_price_amount: number; currency: string; service_fee_bps: number; sort_order: number;
  availability_status: "available" | "held" | "sold"; benefits: Json;
};

export function TableSelector({ eventSlug, tables }: { eventSlug: string; tables: PublicEventTable[] }) {
  const zones = [...new Set(tables.map((table) => table.zone_name))];
  return <div className="grid gap-7">{zones.map((zone) => <section key={zone}><p className="mb-3 text-[10px] font-black uppercase tracking-[.14em] text-neutral-600">{zone}</p><div className="grid gap-3">{tables.filter((table) => table.zone_name === zone).map((table) => {
    const available = table.availability_status === "available";
    const benefits = asBenefits(table.benefits);
    const selection = [{ item_type: "table", item_id: table.id, quantity: 1 }];
    return <article className={`rounded-2xl border p-4 ${available ? "border-white/[.09] bg-white/[.025]" : "border-white/[.05] opacity-55"}`} key={table.id}><div className="flex items-start justify-between gap-3"><div><p className="flex items-center gap-2 font-black"><Armchair className="text-[var(--accent)]" size={16}/>{table.name}</p><p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-neutral-500"><UsersRound size={14}/>{table.capacity} personas</p></div><span className={`text-[9px] font-black uppercase tracking-wider ${available ? "text-emerald-300" : table.availability_status === "held" ? "text-amber-300" : "text-red-300"}`}>{available ? "Disponible" : table.availability_status === "held" ? "Reservada" : "Agotada"}</span></div>
      {benefits.length > 0 && <div className="mt-4 grid gap-1.5 border-t border-white/[.06] pt-3">{benefits.map((benefit) => <p className="flex items-center gap-2 text-xs text-neutral-400" key={`${benefit.name}-${benefit.quantity}`}><Check size={13} className="text-[var(--accent)]"/>{benefit.quantity} {benefit.name.toLowerCase()}</p>)}</div>}
      <div className="mt-4 flex items-center justify-between gap-3"><strong className="text-lg">{formatMoney(table.base_price_amount, table.currency)}</strong>{available ? <Link className="btn btn-primary min-h-11 px-4 text-xs" href={`/e/${eventSlug}/checkout?selection=${encodeURIComponent(JSON.stringify(selection))}`}>Reservar</Link> : <span className="text-xs font-semibold text-neutral-600">No disponible</span>}</div>
    </article>;
  })}</div></section>)}</div>;
}

function asBenefits(value: Json) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || Array.isArray(item) || typeof item !== "object") return [];
    return typeof item.name === "string" && typeof item.quantity === "number" ? [{ name: item.name, quantity: item.quantity }] : [];
  });
}
