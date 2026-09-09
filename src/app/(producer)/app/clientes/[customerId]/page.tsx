import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, Mail, Phone, ShoppingBag } from "lucide-react";
import { getCurrentOrganization } from "@/modules/organizations/application/queries";
import { createClient } from "@/shared/database/server";
import { formatMoney } from "@/shared/lib/format";

export default async function ClientDetailPage({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  const org = await getCurrentOrganization();
  if (!org) redirect("/app/onboarding");
  const supabase = await createClient();

  const { data: customer } = await supabase.from("customers").select("*").eq("id", customerId).eq("organization_id", org.id).single();
  if (!customer) notFound();

  const { data: orders } = await supabase.from("orders").select("id, public_id, event_id, status, total_amount, currency, created_at")
    .eq("customer_id", customerId).eq("organization_id", org.id).order("created_at", { ascending: false });
  const paidOrders = (orders ?? []).filter((order) => order.status === "paid");
  const eventIds = [...new Set((orders ?? []).map((order) => order.event_id))];
  const { data: events } = eventIds.length ? await supabase.from("events").select("id, name, starts_at").in("id", eventIds) : { data: [] };
  const eventById = new Map((events ?? []).map((event) => [event.id, event]));

  const totalSpent = paidOrders.reduce((sum, order) => sum + order.total_amount, 0);
  const currency = paidOrders[0]?.currency ?? "ARS";

  return <>
    <Link href="/app/clientes" className="inline-flex items-center gap-2 text-sm font-bold text-neutral-500 hover:text-white"><ArrowLeft size={16}/>Volver a clientes</Link>
    <div className="mt-7 flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow">Cliente</p><h1 className="page-title mt-2">{`${customer.first_name} ${customer.last_name}`.trim()}</h1><div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-neutral-500"><span className="flex items-center gap-1.5"><Mail size={14}/>{customer.email}</span>{customer.phone && <span className="flex items-center gap-1.5"><Phone size={14}/>{customer.phone}</span>}</div></div></div>
    <div className="mt-6 grid gap-4 sm:grid-cols-3">
      <div className="card p-5"><p className="text-xs font-bold uppercase tracking-wider text-neutral-600">Gastado en total</p><p className="mt-2 text-2xl font-black">{formatMoney(totalSpent, currency)}</p></div>
      <div className="card p-5"><p className="text-xs font-bold uppercase tracking-wider text-neutral-600">Compras pagadas</p><p className="mt-2 text-2xl font-black">{paidOrders.length}</p></div>
      <div className="card p-5"><p className="text-xs font-bold uppercase tracking-wider text-neutral-600">Eventos distintos</p><p className="mt-2 text-2xl font-black">{eventIds.length}</p></div>
    </div>
    <section className="mt-8"><h2 className="section-title">Historial de compras</h2>
      {orders?.length ? <div className="mt-4 card overflow-hidden"><div className="divide-y divide-white/[.06]">{orders.map((order) => {
        const event = eventById.get(order.event_id);
        return <div className="grid gap-2 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-4" key={order.id}>
          <div><p className="font-bold">{event?.name ?? "Evento eliminado"}</p><p className="mt-0.5 flex items-center gap-1.5 text-xs text-neutral-500"><CalendarDays size={12}/>{event ? new Date(event.starts_at).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</p></div>
          <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${order.status === "paid" ? "status-success" : order.status === "refunded" ? "status-warning" : "border border-white/10 text-neutral-500"}`}>{orderStatusLabel(order.status)}</span>
          <p className="text-sm font-black sm:text-right">{formatMoney(order.total_amount, order.currency)}</p>
        </div>;
      })}</div></div> : <div className="mt-4 rounded-xl border border-dashed border-white/[.1] p-8 text-center"><ShoppingBag className="mx-auto text-neutral-700" size={28}/><p className="mt-3 text-sm text-neutral-500">Sin compras registradas.</p></div>}
    </section>
  </>;
}

function orderStatusLabel(status: string) {
  if (status === "paid") return "Pagada";
  if (status === "refunded") return "Reembolsada";
  if (status === "pending") return "Pendiente";
  if (status === "expired") return "Vencida";
  if (status === "cancelled") return "Cancelada";
  return status;
}
