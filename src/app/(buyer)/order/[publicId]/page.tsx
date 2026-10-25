import { createHash } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Banknote, CheckCircle2, CreditCard, Landmark, LoaderCircle, LockKeyhole, Upload } from "lucide-react";
import { startPayment } from "@/modules/payments/application/actions";
import { startTransferPayment, submitTransferProof } from "@/modules/payments/application/transfer-actions";
import { CopyField, TransferRefresher } from "@/modules/payments/ui/transfer-ui";
import { PaymentStatusPoller } from "@/modules/payments/ui/payment-status-poller";
import { EventCover } from "@/modules/events/ui/event-cover";
import { HoldCountdown } from "@/modules/orders/ui/hold-countdown";
import { createClient } from "@/shared/database/server";
import { createAdminClient } from "@/shared/database/admin";
import { formatMoney } from "@/shared/lib/format";
import { SubmitButton } from "@/shared/ui/submit-button";
import { EnpassLogo } from "@/shared/ui/brand";
import { recoverPaidOrderByPublicId } from "@/modules/ticketing/application/fulfillment";
import { getTicketPresentationsForOrder } from "@/modules/ticketing/application/queries";
import { TicketCarousel } from "@/modules/ticketing/ui/ticket-carousel";
import { TicketHolderEditor } from "@/modules/ticketing/ui/ticket-holder-editor";
import { AnalyticsEvent } from "@/shared/ui/analytics-event";
import { toPesos } from "@/shared/lib/analytics";
import { getEventAnalyticsMeta } from "@/modules/events/application/analytics-meta";
import { TicketIssuancePoller } from "@/modules/ticketing/ui/ticket-issuance-poller";

type PublicOrderItem = { item_type: "ticket" | "table"; name: string; quantity: number; unit_price_amount: number; discount_amount?: number };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ publicId: string }>; searchParams: Promise<{ paymentError?: string; returned?: string; metodo?: string }> }) {
  const [{ publicId }, query] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f]{32}$/.test(publicId)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_public_order", { target_public_id: publicId });
  const order = data?.[0];
  if (!order) notFound();
  const items = order.items as unknown as PublicOrderItem[];
  const hasTables = items.some((item) => item.item_type === "table");
  const totalDiscount = items.reduce((sum, item) => sum + (item.discount_amount ?? 0), 0);
  const paid = order.status === "paid";
  const free = order.total_amount === 0;
  const expired = order.status === "expired";
  const refunded = order.status === "refunded";
  const exceptional = order.payment_status === "approved_inventory_conflict" || order.payment_status === "approved_duplicate_charge" || order.payment_requires_action;
  const transfer = order.status === "pending" && !free ? await getTransferState(publicId) : null;
  const transferAvailable = transfer?.available === true;
  const manualIsLatest = !!transfer?.payment_public_id && transfer.payment_public_id === order.payment_public_id && transfer.payment_status !== "cancelled";
  const transferStage: "review" | "instructions" | "rejected" | null = !transferAvailable || !manualIsLatest ? null
    : transfer.payment_status === "processing" ? "review" : transfer.payment_status === "pending" ? "instructions" : transfer.payment_status === "rejected" ? "rejected" : null;
  const canPay = order.status === "pending" && !free && order.payment_account_connected && !exceptional && transferStage !== "review";
  const canChooseTransfer = order.status === "pending" && !free && transferAvailable && !exceptional && (transferStage === null || transferStage === "rejected");
  const issuance = paid ? await recoverPaidOrderByPublicId(publicId) : null;
  const tickets = paid || refunded ? await getTicketPresentationsForOrder(publicId) : [];
  const developmentAttribution = process.env.NODE_ENV === "development" ? await getDevelopmentAttribution(publicId) : null;

  // transaction_id de GA: un hash del código de la orden (el código en sí da acceso a la compra, no se manda a Google).
  const analyticsMeta = await getEventAnalyticsMeta(order.event_slug);
  const transactionId = createHash("sha256").update(publicId).digest("hex").slice(0, 16);

  if (paid || (refunded && tickets.length > 0)) return <main className="container-shell min-h-screen py-6 sm:py-10">{paid && <AnalyticsEvent kind="purchase" transactionId={transactionId} currency={order.currency} value={toPesos(order.total_amount)} items={items.map((item, index) => ({ item_id: `${order.event_slug}-${index}`, item_name: order.event_name, item_variant: item.name, ...analyticsMeta, price: toPesos(Math.round((item.unit_price_amount * item.quantity - (item.discount_amount ?? 0)) / item.quantity)), quantity: item.quantity, ...(item.discount_amount ? { discount: toPesos(Math.round(item.discount_amount / item.quantity)) } : {}) }))}/>}<section className="mx-auto w-full max-w-2xl">
    <header className="mb-6 flex items-center justify-between"><Link href="/"><EnpassLogo/></Link><Link href={"/mis-entradas" as never} className="text-xs font-bold text-neutral-500 hover:text-white">Mis accesos</Link></header>
    <div className="mb-6"><p className="eyebrow">{refunded ? "Compra reembolsada" : free ? "Entradas confirmadas" : "Pago confirmado"}</p><div className="mt-3 flex items-start gap-3"><CheckCircle2 className="mt-1 shrink-0 text-[var(--accent)]" size={28}/><div><h1 className="text-3xl font-black tracking-[-.045em] sm:text-4xl">{refunded ? "Estado de tus accesos" : tickets.length ? "¡Ya tenés tus accesos!" : "Estamos preparando tus accesos"}</h1><p className="mt-2 text-sm leading-6 text-neutral-500">{refunded ? "El pago fue reintegrado y los QR dejaron de ser válidos." : tickets.length ? "Guardá este acceso o recuperalo cuando quieras desde Mis accesos." : free ? "La reserva gratuita quedó confirmada. Estamos generando tus accesos." : "Tu pago está confirmado. No vuelvas a pagar."}</p></div></div></div>
    {tickets.length > 0 ? <><TicketCarousel tickets={tickets}/><TicketHolderEditor tickets={tickets}/></> : <div className="card p-7 sm:p-9"><LoaderCircle className="animate-spin text-[var(--accent)]" size={30}/><h2 className="mt-5 text-xl font-black">Terminando la emisión</h2><p className="mt-2 text-sm leading-6 text-neutral-500">Estamos generando tus credenciales de forma segura. Si demora, podés cerrar esta pantalla: el pago ya quedó confirmado.</p><TicketIssuancePoller/>{issuance?.status === "processing" && <p className="mt-4 rounded-xl border border-amber-300/10 bg-amber-300/[.04] p-4 text-sm text-amber-100/75">Hay una demora extraordinaria en la emisión. No vuelvas a pagar; el equipo puede reintentarla sin generar otro cobro.</p>}</div>}
  </section></main>;

  return <main className="container-shell grid min-h-screen place-items-center py-6 sm:py-10"><section className="w-full max-w-2xl">
    <header className="mb-6 flex items-center justify-between"><EnpassLogo/><span className="flex items-center gap-1.5 text-xs text-neutral-600"><LockKeyhole size={13}/> Compra protegida</span></header>
    <div className="card overflow-hidden"><EventCover src={order.event_cover_url} alt={`Flyer de ${order.event_name}`} className="aspect-[16/7]" priority/><div className="p-5 sm:p-8">
      <OrderHeadline paid={paid} expired={expired} refunded={refunded} exceptional={exceptional} paymentStatus={order.payment_status} transferStage={transferStage}/>
      {query.paymentError && <PaymentError code={query.paymentError}/>}
      {query.returned && order.status === "pending" && <div className="mt-5 rounded-xl border border-white/[.08] bg-white/[.035] p-4 text-sm text-neutral-400">Volviste de Mercado Pago. Estamos verificando el resultado desde el servidor.</div>}
      {order.status === "pending" && transferStage !== "review" && <div className="mt-6"><HoldCountdown expiresAt={order.expires_at} eventSlug={order.event_slug}/></div>}
      <div className="mt-7"><h2 className="text-lg font-bold">{order.event_name}</h2><div className="mt-4 grid gap-3">{items.map((item, index) => <div className="flex justify-between text-sm" key={`${item.name}-${index}`}><span className="text-neutral-400">{item.quantity}× {item.name}</span><span>{item.unit_price_amount === 0 ? "Gratis" : formatMoney(item.quantity * item.unit_price_amount, order.currency)}</span></div>)}</div><div className="mt-5 grid gap-2 border-t border-white/[.08] pt-5 text-sm"><Row label={hasTables ? "Subtotal" : "Entradas"} value={free && totalDiscount === 0 ? "Gratis" : formatMoney(order.subtotal_amount + totalDiscount, order.currency)}/>{totalDiscount > 0 && <Row label="Descuento" value={`−${formatMoney(totalDiscount, order.currency)}`}/>}{!free && <Row label="Cargo de servicio" value={formatMoney(order.service_fee_amount, order.currency)}/>}<Row label="Total" value={free ? "Gratis" : formatMoney(order.total_amount, order.currency)} strong/></div></div>
      {canPay && <form action={startPayment} className="mt-7"><input name="orderPublicId" type="hidden" value={order.public_id}/><SubmitButton className={`btn w-full ${transferStage === "instructions" ? "btn-secondary" : "btn-primary"}`} pendingLabel="Abriendo Mercado Pago…"><CreditCard size={18}/>{order.payment_status === "rejected" ? "Intentar nuevamente" : order.payment_status ? "Continuar en Mercado Pago" : transferStage === "instructions" ? "Mejor pago con Mercado Pago" : "Pagar con Mercado Pago"}</SubmitButton>{!manualIsLatest && <PaymentStatusPoller publicId={order.public_id} initialOrderStatus={order.status} initialPaymentStatus={order.payment_status}/>}</form>}
      {canChooseTransfer && <form action={startTransferPayment} className="mt-3"><input name="orderPublicId" type="hidden" value={order.public_id}/><SubmitButton className="btn btn-secondary w-full" pendingLabel="Preparando la transferencia…"><Landmark size={18}/>{transferStage === "rejected" ? "Volver a intentar por transferencia" : "Pagar por transferencia bancaria"}</SubmitButton></form>}
      {transferStage === "rejected" && transfer?.rejection_reason && <div className="mt-5 rounded-xl border border-red-300/10 bg-red-300/[.04] p-4 text-sm leading-6 text-red-100/75" role="alert"><b>Motivo:</b> {transfer.rejection_reason}</div>}
      {transferStage === "instructions" && transfer && <TransferInstructions publicId={order.public_id} amount={formatMoney(order.total_amount, order.currency)} rawAmount={(order.total_amount / 100).toFixed(2)} alias={transfer.transfer_alias} cbu={transfer.transfer_cbu} holder={transfer.transfer_holder} bank={transfer.transfer_bank} cuit={transfer.transfer_cuit}/>}
      {transferStage === "review" && <div className="mt-6 rounded-xl border border-[var(--border)] p-4 text-sm leading-6 text-neutral-500"><TransferRefresher/>Ya hiciste tu parte: no tenés que hacer nada más. Si pasan muchas horas sin novedades, escribinos a <a className="underline" href="mailto:enpass.gf@gmail.com">enpass.gf@gmail.com</a> con el número de orden <b>{order.public_id.slice(0, 8)}</b>.</div>}
      {order.status === "pending" && !order.payment_account_connected && !transferAvailable && <div className="mt-7 rounded-xl border border-amber-300/10 bg-amber-300/[.04] p-4 text-sm leading-6 text-amber-100/70">El productor todavía no habilitó el cobro online. Tu reserva se liberará automáticamente al vencer.</div>}
      {expired && !exceptional && <Link href={`/e/${order.event_slug}`} className="btn btn-secondary mt-7 w-full">Volver a elegir</Link>}
      {process.env.NODE_ENV === "development" && <details className="mt-7 rounded-xl border border-white/[.06] p-4 text-xs text-neutral-600"><summary className="cursor-pointer font-bold">Información de desarrollo</summary><p className="mt-3 leading-5">Orden: {order.status}. Pago: {order.payment_status ?? "sin iniciar"}. Atribución: {developmentAttribution}. La emisión solo comienza cuando la Order queda paid server-side.</p></details>}
    </div></div>
  </section></main>;
}

function OrderHeadline({ paid, expired, refunded, exceptional, paymentStatus, transferStage }: { paid: boolean; expired: boolean; refunded: boolean; exceptional: boolean; paymentStatus: import("@/shared/database/types").PaymentStatus | null; transferStage: "review" | "instructions" | "rejected" | null }) {
  if (!paid && !expired && !refunded && !exceptional && transferStage === "review") return <><p className="eyebrow">Transferencia en revisión</p><div className="mt-3 flex items-start gap-3"><LoaderCircle className="mt-1 shrink-0 animate-spin text-[var(--accent)]" size={27}/><div><h1 className="text-3xl font-black tracking-[-.045em] sm:text-4xl">Estamos revisando tu pago</h1><p className="mt-3 text-sm leading-6 text-neutral-500">Recibimos tu comprobante. Apenas lo confirmemos te enviamos las entradas por email y aparecen en Mis entradas.</p></div></div></>;
  if (!paid && !expired && !refunded && !exceptional && transferStage === "instructions") return <><p className="eyebrow">Pago por transferencia</p><h1 className="mt-3 text-3xl font-black tracking-[-.045em] sm:text-4xl">Hacé la transferencia y subí el comprobante</h1><p className="mt-3 text-sm leading-6 text-neutral-500">Tus entradas quedan reservadas mientras tanto.</p></>;
  if (!paid && !expired && !refunded && !exceptional && transferStage === "rejected") return <><p className="eyebrow">Transferencia no confirmada</p><h1 className="mt-3 text-3xl font-black tracking-[-.045em] sm:text-4xl">No pudimos confirmar tu transferencia</h1><p className="mt-3 text-sm leading-6 text-neutral-500">Podés volver a intentarlo mientras tu reserva siga activa.</p></>;
  if (exceptional) return <><p className="eyebrow">Revisión necesaria</p><div className="mt-3 flex items-start gap-3"><AlertTriangle className="mt-1 shrink-0 text-amber-300" size={27}/><div><h1 className="text-3xl font-black tracking-[-.045em] sm:text-4xl">Estamos revisando este pago</h1><p className="mt-3 text-sm leading-6 text-neutral-500">No vuelvas a pagar. El caso quedó registrado de forma segura para su revisión.</p></div></div></>;
  if (paid) return <><p className="eyebrow">Pago confirmado</p><div className="mt-3 flex items-start gap-3"><CheckCircle2 className="mt-1 shrink-0 text-[var(--accent)]" size={28}/><div><h1 className="text-3xl font-black tracking-[-.045em] sm:text-4xl">¡Compra confirmada!</h1><p className="mt-3 text-sm leading-6 text-neutral-500">El pago y la disponibilidad quedaron confirmados. En esta etapa de prueba todavía no se emiten entradas ni QR.</p></div></div></>;
  if (refunded) return <><p className="eyebrow">Pago reintegrado</p><h1 className="mt-3 text-3xl font-black tracking-[-.045em] sm:text-4xl">La compra fue reembolsada</h1><p className="mt-3 text-sm leading-6 text-neutral-500">La reserva ya no ocupa disponibilidad.</p></>;
  if (expired) return <><p className="eyebrow">Reserva vencida</p><h1 className="mt-3 text-3xl font-black tracking-[-.045em] sm:text-4xl">La reserva ya no está activa</h1><p className="mt-3 text-sm leading-6 text-neutral-500">La disponibilidad se liberó automáticamente para otros compradores.</p></>;
  if (paymentStatus === "processing") return <><p className="eyebrow">Pago en proceso</p><h1 className="mt-3 text-3xl font-black tracking-[-.045em] sm:text-4xl">Estamos procesando tu pago</h1><p className="mt-3 text-sm leading-6 text-neutral-500">Esperá la confirmación. No es necesario iniciar otro pago.</p></>;
  if (paymentStatus === "pending") return <><p className="eyebrow">Pago pendiente</p><h1 className="mt-3 text-3xl font-black tracking-[-.045em] sm:text-4xl">Estamos esperando tu pago</h1><p className="mt-3 text-sm leading-6 text-neutral-500">Podés continuar en Mercado Pago mientras la reserva siga activa.</p></>;
  if (paymentStatus === "rejected" || paymentStatus === "cancelled") return <><p className="eyebrow">Pago no procesado</p><h1 className="mt-3 text-3xl font-black tracking-[-.045em] sm:text-4xl">No pudimos procesar el pago</h1><p className="mt-3 text-sm leading-6 text-neutral-500">Tu reserva sigue activa durante el tiempo restante y podés intentarlo nuevamente.</p></>;
  return <><p className="eyebrow">Reserva temporal</p><h1 className="mt-3 text-3xl font-black tracking-[-.045em] sm:text-4xl">Tu selección está reservada</h1><p className="mt-3 text-sm leading-6 text-neutral-500">Completá el pago antes de que termine el tiempo.</p></>;
}

function PaymentError({ code }: { code: string }) {
  const messages: Record<string, string> = { hold_expired: "La reserva venció antes de abrir el pago.", payment_account_required: "El productor debe reconectar su cuenta de cobro.", payment_account_reconnect_required: "El productor debe reconectar su cuenta de cobro.", order_not_pending: "Esta orden ya no admite un nuevo pago.", payment_unavailable: "No pudimos abrir el pago. Tu reserva sigue activa; podés reintentar.", transfer_not_available: "Este productor no acepta transferencias.", payment_in_progress: "Ya hay un pago en proceso para esta orden.", transfer_not_started: "Elegí de nuevo \"Pagar por transferencia\" para generar los datos.", transfer_in_review: "Tu transferencia está en revisión: no hace falta iniciar otro pago.", rate_limited: "Hiciste muchos intentos. Esperá un rato y volvé a probar.", accept_no_refund: "Para continuar tenés que aceptar que las compras por transferencia no tienen devolución.", proof_required: "Elegí el archivo del comprobante.", proof_type: "El comprobante tiene que ser una imagen (JPG, PNG, WebP) o un PDF.", proof_size: "El comprobante pesa más de 5 MB.", proof_upload: "No pudimos subir el comprobante. Probá de nuevo." };
  return <div className="mt-5 rounded-xl border border-red-300/10 bg-red-300/[.04] p-4 text-sm text-red-100/75" role="alert">{messages[code] ?? messages.payment_unavailable}</div>;
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div className={`flex justify-between ${strong ? "mt-1 text-lg font-black text-white" : "text-neutral-400"}`}><span>{label}</span><span>{value}</span></div>;
}

async function getDevelopmentAttribution(publicId: string) {
  const admin = createAdminClient();
  const { data: order } = await admin.from("orders").select("promoter_id").eq("public_id", publicId).maybeSingle();
  if (!order?.promoter_id) return "Directa";
  const { data: promoter } = await admin.from("promoters").select("display_name").eq("id", order.promoter_id).maybeSingle();
  return promoter?.display_name ?? "RRPP no disponible";
}

async function getTransferState(publicId: string) {
  const { data } = await createAdminClient().rpc("get_transfer_instructions", { target_order_public_id: publicId });
  return data?.[0] ?? null;
}

function TransferInstructions({ publicId, amount, rawAmount, alias, cbu, holder, bank, cuit }: { publicId: string; amount: string; rawAmount: string; alias: string | null; cbu: string | null; holder: string | null; bank: string | null; cuit: string | null }) {
  return <section className="mt-7 grid gap-5" aria-label="Datos para transferir">
    <div><p className="flex items-center gap-2 text-sm font-black"><span className="grid size-6 place-items-center rounded-full bg-[var(--accent)] text-xs text-[var(--on-accent)]">1</span>Transferí exactamente este monto</p>
      <div className="mt-3 grid gap-2">
        <CopyField label="Monto a transferir" value={rawAmount} display={amount} mono={false} strong/>
        {alias && <CopyField label="Alias" value={alias}/>}
        {cbu && <CopyField label="CBU" value={cbu}/>}
        {(holder || bank || cuit) && <p className="px-1 text-xs leading-5 text-neutral-500">{[holder && `Titular: ${holder}`, cuit && `CUIT ${cuit}`, bank].filter(Boolean).join(" · ")}</p>}
      </div></div>
    <form action={submitTransferProof} className="grid gap-3"><input name="orderPublicId" type="hidden" value={publicId}/>
      <p className="flex items-center gap-2 text-sm font-black"><span className="grid size-6 place-items-center rounded-full bg-[var(--accent)] text-xs text-[var(--on-accent)]">2</span>Subí el comprobante <span className="text-xs font-bold text-neutral-500">(obligatorio)</span></p>
      <label className="grid gap-2 rounded-xl border border-dashed border-[var(--border-strong)] p-4 text-sm"><span className="flex items-center gap-2 font-bold"><Upload size={16}/>Foto, captura o PDF del comprobante</span><input name="proof" type="file" required accept="image/jpeg,image/png,image/webp,application/pdf" className="text-xs"/></label>
      <label className="flex items-start gap-2.5 rounded-xl border border-[var(--border-strong)] p-4 text-xs leading-5"><input type="checkbox" name="acceptNoRefund" required className="mt-0.5 size-4 shrink-0"/><span><b>Entiendo que las compras pagadas por transferencia no tienen devolución.</b></span></label>
      <div className="rounded-xl border border-amber-300/10 bg-amber-300/[.04] p-4 text-xs leading-5 text-amber-100/70">Si transfiere otra persona (por ejemplo un familiar), subí igual su comprobante. Las transferencias pueden demorar unos minutos en acreditarse y ser validadas por ENPASS.</div>
      <SubmitButton className="btn btn-primary w-full" pendingLabel="Enviando comprobante…"><Banknote size={18}/>Ya transferí: enviar comprobante</SubmitButton>
    </form>
  </section>;
}
