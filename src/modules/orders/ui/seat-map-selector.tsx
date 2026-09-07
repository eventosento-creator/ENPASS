"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/shared/lib/format";

export type PublicEventSeat = {
  id: string; event_id: string; section_id: string; section_name: string;
  row_label: string; seat_number: number; label: string;
  base_price_amount: number; currency: string; service_fee_bps: number;
  sort_order: number; availability_status: "available" | "held" | "sold";
};

export function SeatMapSelector({ eventSlug, seats }: { eventSlug: string; seats: PublicEventSeat[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const sections = useMemo(() => {
    const bySection = new Map<string, { name: string; price: number; currency: string; seats: PublicEventSeat[] }>();
    for (const seat of seats) {
      const entry = bySection.get(seat.section_id) ?? { name: seat.section_name, price: seat.base_price_amount, currency: seat.currency, seats: [] };
      entry.seats.push(seat);
      bySection.set(seat.section_id, entry);
    }
    return [...bySection.values()];
  }, [seats]);
  const byId = useMemo(() => new Map(seats.map((seat) => [seat.id, seat])), [seats]);

  function toggle(seat: PublicEventSeat) {
    if (seat.availability_status !== "available") return;
    setSelected((current) => current.includes(seat.id) ? current.filter((id) => id !== seat.id) : current.length >= 8 ? current : [...current, seat.id]);
  }

  const total = selected.reduce((sum, id) => sum + (byId.get(id)?.base_price_amount ?? 0), 0);

  function confirm() {
    const selection = selected.map((id) => ({ item_type: "seat", item_id: id, quantity: 1 }));
    router.push(`/e/${eventSlug}/checkout?selection=${encodeURIComponent(JSON.stringify(selection))}`);
  }

  return <div className="grid gap-7">
    {sections.map((section) => {
      const rows = [...new Set(section.seats.map((seat) => seat.row_label))].sort();
      return <section key={section.name}>
        <div className="mb-3 flex items-baseline justify-between gap-3"><p className="text-[10px] font-black uppercase tracking-[.14em] text-neutral-600">{section.name}</p><span className="text-sm font-bold">{section.price === 0 ? "Gratis" : formatMoney(section.price, section.currency)}</span></div>
        <div className="overflow-x-auto rounded-2xl border border-white/[.08] bg-white/[.02] p-4">
          <div className="inline-flex min-w-full flex-col items-center gap-1.5">
            <div className="mb-2 h-1.5 w-2/3 rounded-full bg-white/[.1]"/>
            {rows.map((row) => <div className="flex items-center gap-1.5" key={row}>
              <span className="w-5 shrink-0 text-[10px] font-black text-neutral-600">{row}</span>
              {section.seats.filter((seat) => seat.row_label === row).sort((a, b) => a.seat_number - b.seat_number).map((seat) => {
                const isSelected = selected.includes(seat.id);
                const tone = seat.availability_status === "sold" ? "bg-white/[.03] text-neutral-700 border-white/[.05] cursor-not-allowed"
                  : seat.availability_status === "held" ? "bg-amber-500/10 text-amber-400/60 border-amber-500/15 cursor-not-allowed"
                  : isSelected ? "bg-[var(--accent)] text-[var(--on-accent)] border-[var(--accent)] scale-110"
                  : "bg-white/[.05] text-neutral-300 border-white/10 hover:border-[var(--accent)]/50";
                return <button type="button" key={seat.id} onClick={() => toggle(seat)} disabled={seat.availability_status !== "available"} title={`${seat.label} · ${seat.availability_status === "sold" ? "Vendido" : seat.availability_status === "held" ? "Reservado" : "Disponible"}`} aria-pressed={isSelected} className={`grid size-7 shrink-0 place-items-center rounded-md border text-[9px] font-black transition ${tone}`}>{seat.seat_number}</button>;
              })}
            </div>)}
          </div>
        </div>
      </section>;
    })}
    <div className="flex items-center gap-3 text-xs text-neutral-500"><LegendDot className="bg-white/[.05] border-white/10"/>Disponible<LegendDot className="bg-[var(--accent)] border-[var(--accent)]"/>Elegido<LegendDot className="bg-amber-500/10 border-amber-500/15"/>Reservado<LegendDot className="bg-white/[.03] border-white/[.05]"/>Vendido</div>
    <div className="sticky-action flex items-center justify-between gap-4 border-t border-white/[.08] pt-5">
      <div><p className="text-sm text-neutral-500">{selected.length} {selected.length === 1 ? "asiento" : "asientos"}</p><p className="text-xl font-black">{total === 0 && selected.length === 0 ? "—" : total === 0 ? "Gratis" : formatMoney(total, sections[0]?.currency ?? "ARS")}</p></div>
      <button type="button" className="btn btn-primary min-h-12 px-6" disabled={selected.length === 0} onClick={confirm}>Confirmar asientos</button>
    </div>
  </div>;
}

function LegendDot({ className }: { className: string }) {
  return <span className={`inline-block size-3 shrink-0 rounded border ${className}`}/>;
}
