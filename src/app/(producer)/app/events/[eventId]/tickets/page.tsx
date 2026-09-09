import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleDollarSign, MailWarning, ShoppingBag } from "lucide-react";
import { createClient } from "@/shared/database/server";
import { formatMoney } from "@/shared/lib/format";
import { TicketTypeEditor } from "@/modules/events/ui/ticket-type-editor";
import { EventSectionNav } from "@/modules/events/ui/event-section-nav";
import { ResendTicketsButton } from "@/modules/ticketing/ui/resend-tickets-button";
import { ShareEventButton } from "@/modules/events/ui/share-event-button";
import { getEventCapabilities } from "@/modules/events/domain/event-profile";
import { DisabledEventModule } from "@/modules/events/ui/disabled-event-module";
import type { TicketDeliveryStatus } from "@/shared/database/types";

export default async function EventTicketsPage({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<{ delivery?: string }> }) {
  const { eventId } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("*").eq("id", eventId).single();
  if (!event) notFound();
  const capabilities = getEventCapabilities(event);
  if (!capabilities.tickets) return <DisabledEventModule eventId={event.id} eventName={event.name} moduleName="Entradas"/>;

  const [{ data: ticketTypes }, { data: metricsData }, { data: sales }] = await Promise.all([
    supabase.from("ticket_types").select("*").eq("event_id", eventId).order("sort_order"),
    supabase.rpc("get_event_ticket_metrics", { target_event: eventId }),
    supabase.rpc("get_event_ticket_sales", { target_event: eventId }),
  ]);
  const ticketMetrics = metricsData?.[0] ?? { tickets_issued: 0, paid_orders: 0, delivery_failures: 0 };
  const publicUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://enpass.com.ar"}/e/${event.slug}`;

  return <>
    <header><Link href={`/app/events/${event.id}`} className="inline-flex items-center gap-2 text-sm font-bold text-neutral-500 hover:text-white"><ArrowLeft size={16}/>Volver al evento</Link><p className="eyebrow mt-7">Entradas</p><h1 className="page-title mt-3">{event.name}</h1></header>
    <EventSectionNav eventId={event.id} active="tickets" capabilities={capabilities}/>
    {query.delivery === "sent" && <p className="status-success mt-6 rounded-xl p-4 text-sm">Acceso reenviado correctamente.</p>}{query.delivery === "failed" && <p className="status-warning mt-6 rounded-xl p-4 text-sm">No se pudo reenviar. La compra y las entradas siguen válidas; podés reintentar.</p>}
    <div className="mt-8 grid items-start gap-6 xl:grid-cols-[380px_1fr]">
      <div className="card p-5 sm:p-7"><h2 className="section-title">Tipos de entrada</h2><div className="mt-4"><TicketTypeEditor organizationId={event.organization_id} eventId={event.id} ticketTypes={ticketTypes ?? []} editable={event.status === "draft"}/></div></div>
      <div className="card p-5 sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-3"><h2 className="section-title">Ventas</h2>{ticketMetrics.delivery_failures > 0 && <span className="flex items-center gap-2 text-xs font-bold text-amber-500"><MailWarning size={15}/>{ticketMetrics.delivery_failures} envío pendiente</span>}</div>
        {sales?.length ? <div className="mt-4 grid gap-3">{sales.map((sale) => <article className="rounded-xl border border-white/[.07] p-4 lg:grid lg:grid-cols-[1fr_1fr_auto] lg:items-center lg:gap-5" key={sale.order_id}><div><div className="flex items-center gap-2"><ShoppingBag size={15} className="text-[var(--accent)]"/><p className="font-bold">Compra #{sale.order_public_id.slice(0, 8).toUpperCase()}</p><span className="rounded-full bg-[var(--accent)]/10 px-2 py-1 text-[10px] font-black uppercase text-[var(--accent)]">{sale.order_status === "paid" ? "Pagada" : "Reembolsada"}</span></div><p className="mt-2 text-sm text-neutral-400">{sale.buyer_name}</p><p className="mt-1 text-xs text-neutral-600">{sale.buyer_email}</p></div><div><p className="text-sm font-bold">{sale.ticket_count} {sale.ticket_count === 1 ? "entrada" : "entradas"}</p><p className="mt-1 text-xs text-neutral-500">{sale.ticket_names || "Emisión pendiente"}</p><p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-neutral-500"><CircleDollarSign size={13}/>{formatMoney(sale.total_amount, sale.currency)} · {deliveryLabel(sale.delivery_status)}</p></div><div className="mt-3 lg:mt-0">{sale.order_status === "paid" && sale.ticket_count > 0 && <ResendTicketsButton orderId={sale.order_id} eventId={event.id}/>}</div></article>)}</div> : <div className="mt-4 rounded-xl border border-dashed border-white/[.1] p-8 text-center"><ShoppingBag className="mx-auto text-neutral-700" size={28}/><h3 className="mt-4 font-black">Todavía no hay ventas pagadas</h3><p className="mx-auto mt-2 max-w-sm text-sm text-neutral-500">Las compras confirmadas aparecerán acá con su emisión y entrega.</p><div className="mt-5 flex justify-center"><ShareEventButton url={publicUrl}/></div></div>}
      </div>
    </div>
  </>;
}

function deliveryLabel(status: TicketDeliveryStatus | null) { if (status === "sent") return "Email enviado"; if (status === "failed") return "Email falló"; if (status === "processing") return "Enviando email"; return "Email pendiente"; }
