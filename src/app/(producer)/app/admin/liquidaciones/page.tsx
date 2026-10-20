import { notFound } from "next/navigation";
import { Wallet } from "lucide-react";
import { createClient } from "@/shared/database/server";
import { isPlatformAdmin } from "@/modules/organizations/application/queries";
import { cancelTransferPayout, createTransferPayout, markTransferPayoutPaid } from "@/modules/payments/application/transfer-admin-actions";
import { formatMoney } from "@/shared/lib/format";
import { SubmitButton } from "@/shared/ui/submit-button";

const notices: Record<string, { text: string; tone: "ok" | "warn" }> = {
  created: { text: "Liquidación creada. Hacé la transferencia al productor y marcala como pagada con el comprobante.", tone: "ok" },
  paid: { text: "Liquidación marcada como pagada.", tone: "ok" },
  cancelled: { text: "Liquidación cancelada: las ventas volvieron al saldo.", tone: "ok" },
  no_details: { text: "El productor todavía no cargó sus datos de cobro (Ajustes → Liquidaciones). Pedíselos antes de liquidar.", tone: "warn" },
  nothing: { text: "No hay ventas para liquidar (los eventos todavía no terminaron). Podés incluir los próximos si querés adelantar.", tone: "warn" },
  error: { text: "No se pudo completar la acción. Probá de nuevo.", tone: "warn" },
  invalid: { text: "Datos inválidos.", tone: "warn" },
};

export default async function AdminSettlementsPage({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  if (!(await isPlatformAdmin())) notFound();
  const query = await searchParams;
  const supabase = await createClient();
  const [{ data: summary }, { data: payouts }, { data: organizations }] = await Promise.all([
    supabase.rpc("get_transfer_settlement_summary"),
    supabase.from("transfer_payouts").select("*").neq("status", "cancelled").order("created_at", { ascending: false }).limit(60),
    supabase.from("organizations").select("id, name"),
  ]);
  const nameById = new Map((organizations ?? []).map((organization) => [organization.id, organization.name]));
  const pending = (payouts ?? []).filter((payout) => payout.status === "pending");
  const paid = (payouts ?? []).filter((payout) => payout.status === "paid");
  const notice = query.r ? notices[query.r] : null;
  const totalOwed = (summary ?? []).reduce((sum, row) => sum + row.owed_amount + row.pending_payout_amount, 0);

  return <>
    <header className="flex items-center gap-2"><Wallet className="text-[var(--accent)]" size={22}/><h1 className="page-title">Liquidaciones a productores</h1></header>
    <p className="mt-2 max-w-2xl text-sm text-neutral-500">Plata cobrada por transferencia que ENPASS le debe a cada productor (el precio base de las entradas; tu cargo de servicio no entra). Por defecto solo se liquidan eventos que ya terminaron.</p>
    <p className="mt-3 text-sm"><b>Total que debe ENPASS hoy:</b> {formatMoney(totalOwed)}</p>
    {notice && <p role="status" className={`mt-5 rounded-xl border p-4 text-sm ${notice.tone === "ok" ? "border-[var(--accent)]/20 bg-[var(--accent)]/[.06]" : "border-amber-400/30 bg-amber-400/[.08]"}`}>{notice.text}</p>}

    <h2 className="mt-8 text-xl font-black">Para liquidar</h2>
    <div className="mt-3 grid gap-3">
      {(summary ?? []).filter((row) => row.owed_amount > 0).map((row) => <div key={row.organization_id} className="card grid gap-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-black">{row.organization_name}</p><p className="text-xs text-neutral-500">{row.owed_orders} {row.owed_orders === 1 ? "venta" : "ventas"} sin liquidar{row.has_payout_details ? "" : " · sin datos de cobro"}</p></div>
          <div className="text-right"><p className="text-lg font-black">{formatMoney(row.owed_amount)}</p><p className="text-xs text-neutral-500">{formatMoney(row.owed_ready_amount)} listo (eventos terminados)</p></div></div>
        <form action={createTransferPayout} className="flex flex-wrap items-center gap-3"><input type="hidden" name="organizationId" value={row.organization_id}/>
          <SubmitButton className="btn btn-primary" pendingLabel="Creando…">Crear liquidación</SubmitButton>
          <label className="flex items-center gap-2 text-xs text-neutral-500"><input type="checkbox" name="includeUpcoming" className="size-4"/>Incluir eventos que todavía no terminaron</label></form>
      </div>)}
      {!(summary ?? []).some((row) => row.owed_amount > 0) && <p className="text-sm text-neutral-500">No hay ventas por transferencia pendientes de liquidar.</p>}
    </div>

    <h2 className="mt-10 text-xl font-black">Liquidaciones a pagar</h2>
    <div className="mt-3 grid gap-3">
      {pending.map((payout) => { const destination = payout.destination_snapshot; return <div key={payout.id} className="card grid gap-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-black">{nameById.get(payout.organization_id) ?? "Productor"}</p><p className="text-xs text-neutral-500">{payout.orders_count} {payout.orders_count === 1 ? "venta" : "ventas"} · creada {new Date(payout.created_at).toLocaleDateString("es-AR")}</p></div><p className="text-xl font-black">{formatMoney(payout.amount, payout.currency)}</p></div>
        <div className="rounded-xl border border-[var(--border)] p-3 text-sm"><p className="text-[11px] font-bold uppercase tracking-[.08em] text-neutral-500">Transferir a</p><p className="mt-1 font-bold">{destination.holder ?? "—"}{destination.cuit ? ` · CUIT ${destination.cuit}` : ""}</p><p className="mt-1 break-all font-mono text-xs">{[destination.alias && `Alias: ${destination.alias}`, destination.cbu && `CBU: ${destination.cbu}`].filter(Boolean).join("   ")}</p></div>
        <div className="flex flex-wrap items-end gap-2">
          <form action={markTransferPayoutPaid} className="flex flex-wrap items-end gap-2"><input type="hidden" name="payoutId" value={payout.id}/><input className="field" name="reference" placeholder="N° de comprobante de tu transferencia" maxLength={200}/><SubmitButton className="btn btn-primary" pendingLabel="Guardando…">Ya la transferí</SubmitButton></form>
          <form action={cancelTransferPayout}><input type="hidden" name="payoutId" value={payout.id}/><SubmitButton className="btn btn-ghost text-red-400" pendingLabel="…">Cancelar</SubmitButton></form>
        </div>
      </div>; })}
      {!pending.length && <p className="text-sm text-neutral-500">No hay liquidaciones esperando que las pagues.</p>}
    </div>

    <h2 className="mt-10 text-xl font-black">Historial de pagadas</h2>
    <div className="mt-3 grid gap-2">
      {paid.map((payout) => <div key={payout.id} className="card flex flex-wrap items-center justify-between gap-3 p-3 text-sm"><div><p className="font-bold">{nameById.get(payout.organization_id) ?? "Productor"}</p><p className="text-xs text-neutral-500">{payout.paid_at ? new Date(payout.paid_at).toLocaleDateString("es-AR") : ""}{payout.reference ? ` · ${payout.reference}` : ""}</p></div><p className="font-black">{formatMoney(payout.amount, payout.currency)}</p></div>)}
      {!paid.length && <p className="text-sm text-neutral-500">Todavía no pagaste ninguna liquidación.</p>}
    </div>
  </>;
}
