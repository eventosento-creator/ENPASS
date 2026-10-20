import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, Landmark } from "lucide-react";
import { getCurrentOrganization } from "@/modules/organizations/application/queries";
import { PayoutDetailsForm } from "@/modules/payments/ui/payout-details-form";
import { createClient } from "@/shared/database/server";
import { formatMoney } from "@/shared/lib/format";

export default async function SettlementsPage() {
  const organization = await getCurrentOrganization();
  if (!organization) redirect("/app/onboarding");
  if (!["owner", "admin"].includes(organization.role)) notFound();
  const supabase = await createClient();
  const [{ data: balanceRows }, { data: events }, { data: payouts }, { data: details }, { data: orgRow }] = await Promise.all([
    supabase.rpc("get_transfer_balance", { target_org: organization.id }),
    supabase.rpc("get_transfer_sales_by_event", { target_org: organization.id }),
    supabase.from("transfer_payouts").select("*").eq("organization_id", organization.id).neq("status", "cancelled").order("created_at", { ascending: false }).limit(50),
    supabase.from("organization_payout_details").select("*").eq("organization_id", organization.id).maybeSingle(),
    supabase.from("organizations").select("ticket_transfer_enabled").eq("id", organization.id).maybeSingle(),
  ]);
  const balance = balanceRows?.[0];
  if (!orgRow?.ticket_transfer_enabled && !(events?.length) && !(payouts?.length)) notFound();

  return <div className="mx-auto max-w-4xl">
    <Link href={"/app/settings" as never} className="inline-flex min-h-11 items-center gap-1 text-sm text-neutral-500"><ChevronLeft size={16}/>Ajustes</Link>
    <p className="eyebrow mt-2">Ventas por transferencia</p><h1 className="page-title mt-2">Liquidaciones</h1>
    <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-500">Cuando un comprador paga por transferencia, ENPASS recibe el dinero y te lo liquida después. Acá ves cuánto tenés para cobrar, lo que ya te pagamos y a dónde te lo enviamos. El cargo de servicio es de ENPASS: te corresponde el valor completo de tus entradas.</p>

    <section className="mt-8 grid gap-3 sm:grid-cols-3" aria-label="Resumen">
      <Stat label="Para cobrar" value={formatMoney(balance?.owed_amount ?? 0)} note={balance?.owed_ready_amount ? `${formatMoney(balance.owed_ready_amount)} listo para liquidar` : "Se liquida cuando termina el evento"}/>
      <Stat label="En liquidación" value={formatMoney(balance?.pending_payout_amount ?? 0)} note="ENPASS lo está por transferir"/>
      <Stat label="Ya cobrado" value={formatMoney(balance?.paid_amount ?? 0)} note="Liquidaciones pagadas"/>
    </section>

    <section className="card mt-6 p-5 sm:p-7">
      <h2 className="flex items-center gap-2 text-lg font-black"><Landmark size={18}/>¿A dónde te enviamos el dinero?</h2>
      {!balance?.has_payout_details && <p className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/[.06] p-3 text-sm">Cargá tus datos de cobro: sin ellos ENPASS no puede liquidarte.</p>}
      <div className="mt-4"><PayoutDetailsForm organizationId={organization.id} holder={details?.holder ?? null} cuit={details?.cuit ?? null} alias={details?.alias ?? null} cbu={details?.cbu ?? null}/></div>
    </section>

    <h2 className="mt-10 text-lg font-black">Por evento</h2>
    <div className="mt-3 grid gap-2">
      {(events ?? []).map((event) => <div key={event.event_id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0"><p className="truncate font-bold">{event.event_name}</p><p className="text-xs text-neutral-500">{new Date(event.event_starts_at).toLocaleDateString("es-AR")} · {event.orders_count} {event.orders_count === 1 ? "venta" : "ventas"} · {event.event_ended ? "evento terminado" : "evento por venir"}</p></div>
        <div className="text-right text-sm"><p className="font-black">{formatMoney(event.total_amount)}</p><p className="text-xs text-neutral-500">{[event.owed_amount > 0 && `${formatMoney(event.owed_amount)} para cobrar`, event.pending_amount > 0 && `${formatMoney(event.pending_amount)} en liquidación`, event.paid_amount > 0 && `${formatMoney(event.paid_amount)} cobrado`].filter(Boolean).join(" · ")}</p></div>
      </div>)}
      {!events?.length && <p className="text-sm text-neutral-500">Todavía no hay ventas por transferencia.</p>}
    </div>

    <h2 className="mt-10 text-lg font-black">Historial de liquidaciones</h2>
    <div className="mt-3 grid gap-2">
      {(payouts ?? []).map((payout) => <div key={payout.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div><p className="font-bold">{formatMoney(payout.amount, payout.currency)}</p><p className="text-xs text-neutral-500">{payout.orders_count} {payout.orders_count === 1 ? "venta" : "ventas"} · creada {new Date(payout.created_at).toLocaleDateString("es-AR")}{payout.paid_at ? ` · pagada ${new Date(payout.paid_at).toLocaleDateString("es-AR")}` : ""}</p>{payout.reference && <p className="text-xs text-neutral-500">Comprobante: {payout.reference}</p>}</div>
        <span className={`rounded-full border px-3 py-1 text-xs font-bold ${payout.status === "paid" ? "border-lime-300/30 text-lime-700" : "border-white/[.12] text-neutral-500"}`}>{payout.status === "paid" ? "Pagada" : "En proceso"}</span>
      </div>)}
      {!payouts?.length && <p className="text-sm text-neutral-500">Todavía no hay liquidaciones.</p>}
    </div>
  </div>;
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="card p-4"><p className="text-xs font-bold uppercase tracking-[.08em] text-neutral-500">{label}</p><p className="mt-1 text-2xl font-black tracking-[-.02em]">{value}</p><p className="mt-1 text-xs text-neutral-500">{note}</p></div>;
}
