import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, CreditCard, LoaderCircle, LockKeyhole } from "lucide-react";
import { startPayment } from "@/modules/payments/application/actions";
import { PaymentStatusPoller } from "@/modules/payments/ui/payment-status-poller";
import { EventCover } from "@/modules/events/ui/event-cover";
import { HoldCountdown } from "@/modules/orders/ui/hold-countdown";
import { createClient } from "@/shared/database/server";
import { formatMoney } from "@/shared/lib/format";
import { SubmitButton } from "@/shared/ui/submit-button";
import { recoverPaidOrderByPublicId } from "@/modules/ticketing/application/fulfillment";
import { getTicketPresentationsForOrder } from "@/modules/ticketing/application/queries";
import { TicketCarousel } from "@/modules/ticketing/ui/ticket-carousel";
import { TicketIssuancePoller } from "@/modules/ticketing/ui/ticket-issuance-poller";

type PublicOrderItem = { name: string; quantity: number; unit_price_amount: number };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ publicId: string }>; searchParams: Promise<{ paymentError?: string; returned?: string }> }) {
  const [{ publicId }, query] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f]{32}$/.test(publicId)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_public_order", { target_public_id: publicId });
  const order = data?.[0];
  if (!order) notFound();
  const items = order.items as unknown as PublicOrderItem[];
  const paid = order.status === "paid";
  const expired = order.status === "expired";
  const refunded = order.status === "refunded";
  const exceptional = order.payment_status === "approved_inventory_conflict" || order.payment_status === "approved_duplicate_charge" || order.payment_requires_action;
  const canPay = order.status === "pending" && order.payment_account_connected && !exceptional;
  const issuance = paid ? await recoverPaidOrderByPublicId(publicId) : null;
  const tickets = paid || refunded ? await getTicketPresentationsForOrder(publicId) : [];

  if (paid || (refunded && tickets.length > 0)) return <main className="container-shell min-h-screen py-6 sm:py-10"><section className="mx-auto w-full max-w-2xl">
    <header className="mb-6 flex items-center justify-between"><Link href="/" className="text-sm font-black tracking-[-.03em]">NIGHTLIFE OS</Link><Link href={"/mis-entradas" as never} className="text-xs font-bold text-neutral-500 hover:text-white">Mis entradas</Link></header>
    <div className="mb-6"><p className="eyebrow">{refunded ? "Compra reembolsada" : "Pago confirmado"}</p><div className="mt-3 flex items-start gap-3"><CheckCircle2 className="mt-1 shrink-0 text-[var(--accent)]" size={28}/><div><h1 className="text-3xl font-black tracking-[-.045em] sm:text-4xl">{refunded ? "Estado de tus entradas" : tickets.length ? "¡Ya tenés tus entradas!" : "Estamos preparando tus entradas"}</h1><p className="mt-2 text-sm leading-6 text-neutral-500">{refunded ? "El pago fue reintegrado y los QR dejaron de ser válidos." : tickets.length ? "Guardá este acceso o recuperalas cuando quieras desde Mis entradas." : "Tu pago está confirmado. No vuelvas a pagar."}</p></div></div></div>
    {tickets.length > 0 ? <TicketCarousel tickets={tickets}/> : <div className="card p-7 sm:p-9"><LoaderCircle className="animate-spin text-[var(--accent)]" size={30}/><h2 className="mt-5 text-xl font-black">Terminando la emisión</h2><p className="mt-2 text-sm leading-6 text-neutral-500">Estamos generando tus credenciales de forma segura. Si demora, podés cerrar esta pantalla: el pago ya quedó confirmado.</p><TicketIssuancePoller/>{issuance?.status === "processing" && <p className="mt-4 rounded-xl border border-amber-300/10 bg-amber-300/[.04] p-4 text-sm text-amber-100/75">Hay una demora extraordinaria en la emisión. No vuelvas a pagar; el equipo puede reintentarla sin generar otro cobro.</p>}</div>}
  </section></main>;

  return <main className="container-shell grid min-h-screen place-items-center py-6 sm:py-10"><section className="w-full max-w-2xl">
    <header className="mb-6 flex items-center justify-between"><span className="text-sm font-black tracking-[-.03em]">NIGHTLIFE OS</span><span className="flex items-center gap-1.5 text-xs text-neutral-600"><LockKeyhole size={13}/> Compra protegida</span></header>
    <div className="card overflow-hidden"><EventCover src={order.event_cover_url} alt={`Flyer de ${order.event_name}`} className="aspect-[16/7]" priority/><div className="p-5 sm:p-8">
      <OrderHeadline paid={paid} expired={expired} refunded={refunded} exceptional={exceptional} paymentStatus={order.payment_status}/>
      {query.paymentError && <PaymentError code={query.paymentError}/>}
      {query.returned && order.status === "pending" && <div className="mt-5 rounded-xl border border-white/[.08] bg-white/[.035] p-4 text-sm text-neutral-400">Volviste de Mercado Pago. Estamos verificando el resultado desde el servidor.</div>}
      {order.status === "pending" && <div className="mt-6"><HoldCountdown expiresAt={order.expires_at} eventSlug={order.event_slug}/></div>}
      <div className="mt-7"><h2 className="text-lg font-bold">{order.event_name}</h2><div className="mt-4 grid gap-3">{items.map((item, index) => <div className="flex justify-between text-sm" key={`${item.name}-${index}`}><span className="text-neutral-400">{item.quantity}× {item.name}</span><span>{formatMoney(item.quantity * item.unit_price_amount, order.currency)}</span></div>)}</div><div className="mt-5 grid gap-2 border-t border-white/[.08] pt-5 text-sm"><Row label="Entradas" value={formatMoney(order.subtotal_amount, order.currency)}/><Row label="Cargo de servicio" value={formatMoney(order.service_fee_amount, order.currency)}/><Row label="Total" value={formatMoney(order.total_amount, order.currency)} strong/></div></div>
      {canPay && <form action={startPayment} className="mt-7"><input name="orderPublicId" type="hidden" value={order.public_id}/><SubmitButton className="btn btn-primary w-full" pendingLabel="Abriendo Mercado Pago…"><CreditCard size={18}/>{order.payment_status === "rejected" ? "Intentar nuevamente" : order.payment_status ? "Continuar en Mercado Pago" : "Pagar con Mercado Pago"}</SubmitButton><PaymentStatusPoller publicId={order.public_id} initialOrderStatus={order.status} initialPaymentStatus={order.payment_status}/></form>}
      {order.status === "pending" && !order.payment_account_connected && <div className="mt-7 rounded-xl border border-amber-300/10 bg-amber-300/[.04] p-4 text-sm leading-6 text-amber-100/70">El productor todavía no habilitó el cobro online. Tu reserva se liberará automáticamente al vencer.</div>}
      {expired && !exceptional && <Link href={`/e/${order.event_slug}`} className="btn btn-secondary mt-7 w-full">Volver a elegir entradas</Link>}
      {process.env.NODE_ENV === "development" && <details className="mt-7 rounded-xl border border-white/[.06] p-4 text-xs text-neutral-600"><summary className="cursor-pointer font-bold">Información de desarrollo</summary><p className="mt-3 leading-5">Orden: {order.status}. Pago: {order.payment_status ?? "sin iniciar"}. La emisión solo comienza cuando la Order queda paid server-side.</p></details>}
    </div></div>
  </section></main>;
}

function OrderHeadline({ paid, expired, refunded, exceptional, paymentStatus }: { paid: boolean; expired: boolean; refunded: boolean; exceptional: boolean; paymentStatus: import("@/shared/database/types").PaymentStatus | null }) {
  if (exceptional) return <><p className="eyebrow">Revisión necesaria</p><div className="mt-3 flex items-start gap-3"><AlertTriangle className="mt-1 shrink-0 text-amber-300" size={27}/><div><h1 className="text-3xl font-black tracking-[-.045em] sm:text-4xl">Estamos revisando este pago</h1><p className="mt-3 text-sm leading-6 text-neutral-500">No vuelvas a pagar. El caso quedó registrado de forma segura para su revisión.</p></div></div></>;
  if (paid) return <><p className="eyebrow">Pago confirmado</p><div className="mt-3 flex items-start gap-3"><CheckCircle2 className="mt-1 shrink-0 text-[var(--accent)]" size={28}/><div><h1 className="text-3xl font-black tracking-[-.045em] sm:text-4xl">¡Compra confirmada!</h1><p className="mt-3 text-sm leading-6 text-neutral-500">El pago y la disponibilidad quedaron confirmados. En esta etapa de prueba todavía no se emiten entradas ni QR.</p></div></div></>;
  if (refunded) return <><p className="eyebrow">Pago reintegrado</p><h1 className="mt-3 text-3xl font-black tracking-[-.045em] sm:text-4xl">La compra fue reembolsada</h1><p className="mt-3 text-sm leading-6 text-neutral-500">La reserva ya no ocupa disponibilidad.</p></>;
  if (expired) return <><p className="eyebrow">Reserva vencida</p><h1 className="mt-3 text-3xl font-black tracking-[-.045em] sm:text-4xl">La reserva ya no está activa</h1><p className="mt-3 text-sm leading-6 text-neutral-500">Las entradas se liberaron automáticamente para otros compradores.</p></>;
  if (paymentStatus === "processing") return <><p className="eyebrow">Pago en proceso</p><h1 className="mt-3 text-3xl font-black tracking-[-.045em] sm:text-4xl">Estamos procesando tu pago</h1><p className="mt-3 text-sm leading-6 text-neutral-500">Esperá la confirmación. No es necesario iniciar otro pago.</p></>;
  if (paymentStatus === "pending") return <><p className="eyebrow">Pago pendiente</p><h1 className="mt-3 text-3xl font-black tracking-[-.045em] sm:text-4xl">Estamos esperando tu pago</h1><p className="mt-3 text-sm leading-6 text-neutral-500">Podés continuar en Mercado Pago mientras la reserva siga activa.</p></>;
  if (paymentStatus === "rejected" || paymentStatus === "cancelled") return <><p className="eyebrow">Pago no procesado</p><h1 className="mt-3 text-3xl font-black tracking-[-.045em] sm:text-4xl">No pudimos procesar el pago</h1><p className="mt-3 text-sm leading-6 text-neutral-500">Tu reserva sigue activa durante el tiempo restante y podés intentarlo nuevamente.</p></>;
  return <><p className="eyebrow">Reserva temporal</p><h1 className="mt-3 text-3xl font-black tracking-[-.045em] sm:text-4xl">Tus entradas están reservadas</h1><p className="mt-3 text-sm leading-6 text-neutral-500">Completá el pago antes de que termine el tiempo.</p></>;
}

function PaymentError({ code }: { code: string }) {
  const messages: Record<string, string> = { hold_expired: "La reserva venció antes de abrir el pago.", payment_account_required: "El productor debe reconectar su cuenta de cobro.", payment_account_reconnect_required: "El productor debe reconectar su cuenta de cobro.", order_not_pending: "Esta orden ya no admite un nuevo pago.", payment_unavailable: "No pudimos abrir Mercado Pago. Tu reserva sigue activa; podés reintentar." };
  return <div className="mt-5 rounded-xl border border-red-300/10 bg-red-300/[.04] p-4 text-sm text-red-100/75" role="alert">{messages[code] ?? messages.payment_unavailable}</div>;
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div className={`flex justify-between ${strong ? "mt-1 text-lg font-black text-white" : "text-neutral-400"}`}><span>{label}</span><span>{value}</span></div>;
}
