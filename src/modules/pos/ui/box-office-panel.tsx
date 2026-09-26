"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Banknote, Check, CreditCard, ExternalLink, Landmark, LoaderCircle, Minus, MoreHorizontal, Plus, QrCode, Smartphone, Ticket, X } from "lucide-react";
import { formatMoney } from "@/shared/lib/format";
import { boxOfficeChipLabels, boxOfficeDisplayLabels, boxOfficeMethodLabels, enabledBoxOfficeMethods, type BoxOfficeConfig, type BoxOfficePaymentMethod, type BoxOfficeQuote, type BoxOfficeTicketType } from "../domain/box-office";

type PayMethod = BoxOfficePaymentMethod | "mp_qr" | "online";
type OrderStatusBody = { status: { order_status: string; payment_status: string | null; payment_detail: string | null; payment_method: string | null; total_amount: number; expires_at: string; seconds_left: number }; ticketUrl: string | null; ticketQrDataUrl: string | null; ticketsIssued: boolean; error?: string };
type QrData = { orderPublicId: string; qrDataUrl: string; totalAmount: number; currency: string; expiresAt: string };
type ConfirmedSale = {
  sale: { order_public_id: string; total_amount: number; service_fee_amount: number; currency: string; payment_method: string; cash_received_amount: number | null; change_amount: number };
  ticketsIssued: boolean; emailed: boolean; ticketUrl: string; ticketQrDataUrl: string;
};

const methodIcons: Record<BoxOfficePaymentMethod, typeof Banknote> = {
  cash: Banknote, qr: QrCode, debit_card: CreditCard, credit_card: CreditCard, bank_transfer: Landmark, other: MoreHorizontal,
};

export function BoxOfficePanel({ config, catalog, online, onSold }: { config: BoxOfficeConfig; catalog: BoxOfficeTicketType[]; online: boolean; onSold: () => void }) {
  const methods = enabledBoxOfficeMethods(config);
  const [selected, setSelected] = useState<BoxOfficeTicketType | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [quoteState, setQuoteState] = useState<{ key: string; quote: BoxOfficeQuote } | null>(null);
  const payMethods: PayMethod[] = [...methods, ...(config.mp_qr_ready ? ["mp_qr" as const] : []), "online"];
  const [method, setMethod] = useState<PayMethod>(methods[0] ?? (config.mp_qr_ready ? "mp_qr" : "online"));
  const [onlineLink, setOnlineLink] = useState<{ url: string; qrDataUrl: string; ticketName: string; unitPrice: number; currency: string; quantity: number; ticketTypeId: string; shownAt: string } | null>(null);
  const [qr, setQr] = useState<QrData | null>(null);
  const [receivedPesos, setReceivedPesos] = useState("");
  const [reference, setReference] = useState("");
  const [buyer, setBuyer] = useState({ firstName: "", lastName: "", document: "", email: "", phone: "" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<ConfirmedSale | null>(null);
  const attempt = useRef<{ key: string; orderPublicId: string | null }>({ key: crypto.randomUUID(), orderPublicId: null });

  const quoteKey = selected ? `${selected.ticket_type_id}:${quantity}` : null;
  const quote = quoteState && quoteState.key === quoteKey ? quoteState.quote : null;

  useEffect(() => {
    if (!selected || !quoteKey) return;
    let cancelled = false;
    fetch("/api/pos/box-office/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ticketTypeId: selected.ticket_type_id, quantity }) })
      .then(async (response) => ({ ok: response.ok, body: await response.json() as { quote?: BoxOfficeQuote; error?: string } }))
      .then(({ ok, body }) => { if (cancelled) return; if (ok && body.quote) { setQuoteState({ key: quoteKey, quote: body.quote }); setError(null); } else setError(body.error ?? "No pudimos calcular el precio."); })
      .catch(() => { if (!cancelled) setError("Sin conexión."); });
    return () => { cancelled = true; };
  }, [selected, quantity, quoteKey]);

  function resetAttempt() {
    const abandoned = attempt.current.orderPublicId;
    if (abandoned) void fetch("/api/pos/box-office/cancel", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderPublicId: abandoned }) }).catch(() => undefined);
    attempt.current = { key: crypto.randomUUID(), orderPublicId: null };
  }
  function pick(ticket: BoxOfficeTicketType) { setSelected(ticket); setQuantity(1); setError(null); setReceivedPesos(""); resetAttempt(); }
  function changeQuantity(next: number) {
    if (!selected) return;
    const max = Math.max(1, Math.min(selected.max_per_order, selected.available_quantity));
    setQuantity(Math.min(max, Math.max(1, next))); resetAttempt();
  }
  function newSale() { setOnlineLink(null); setQr(null); setDone(null); setSelected(null); setQuantity(1); setReceivedPesos(""); setReference(""); setBuyer({ firstName: "", lastName: "", document: "", email: "", phone: "" }); setError(null); resetAttempt(); onSold(); }

  const received = Math.round(Number(receivedPesos) * 100);
  const change = quote && method === "cash" ? Math.max(0, received - quote.total_amount) : 0;
  const documentDigits = buyer.document.replace(/[.\s-]/g, "");
  const buyerValid = buyer.firstName.trim() !== "" && buyer.lastName.trim() !== "" && /^\d{7,8}$/.test(documentDigits) && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(buyer.email.trim());
  const canCharge = Boolean(quote) && online && !pending && (method === "online" || (buyerValid && (method !== "cash" || received >= (quote?.total_amount ?? 0))));

  async function showOnlineQr() {
    if (!selected || pending) return;
    setPending(true); setError(null);
    try {
      const response = await fetch("/api/pos/box-office/online-link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ticketTypeId: selected.ticket_type_id, quantity }) });
      const body = await response.json() as { url?: string; qrDataUrl?: string; ticketName?: string; unitPrice?: number; currency?: string; quantity?: number; ticketTypeId?: string; error?: string };
      if (!response.ok || !body.qrDataUrl || !body.url) { setError(body.error ?? "No pudimos generar el QR."); return; }
      setOnlineLink({ url: body.url, qrDataUrl: body.qrDataUrl, ticketName: body.ticketName ?? selected.name, unitPrice: body.unitPrice ?? selected.unit_price_amount, currency: body.currency ?? selected.currency, quantity: body.quantity ?? quantity, ticketTypeId: body.ticketTypeId ?? selected.ticket_type_id, shownAt: new Date().toISOString() });
    } catch { setError("Sin conexión."); }
    finally { setPending(false); }
  }

  async function charge() {
    if (method === "online") { await showOnlineQr(); return; }
    if (!selected || !quote || pending) return;
    if (method !== "cash" && !window.confirm(`Esto emite la entrada YA como cobrada por ${boxOfficeMethodLabels[method as BoxOfficePaymentMethod]}.\n\n¿Confirmás que el dinero ya llegó a tu cuenta o terminal?\n\nSi querés que el cliente pague ahora, cancelá y usá "Pagar online (QR)".`)) return;
    setPending(true); setError(null);
    try {
      if (!attempt.current.orderPublicId) {
        const created = await fetch("/api/pos/box-office/sale", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
          idempotencyKey: attempt.current.key, ticketTypeId: selected.ticket_type_id, quantity,
          buyerFirstName: buyer.firstName, buyerLastName: buyer.lastName, buyerDocument: buyer.document, buyerEmail: buyer.email, buyerPhone: buyer.phone,
        }) });
        const createdBody = await created.json() as { order?: { order_public_id: string }; error?: string };
        if (!created.ok || !createdBody.order) { setError(createdBody.error ?? "No pudimos reservar la venta."); return; }
        attempt.current.orderPublicId = createdBody.order.order_public_id;
      }
      if (method === "mp_qr") {
        const started = await fetch("/api/pos/box-office/qr", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderPublicId: attempt.current.orderPublicId }) });
        const startedBody = await started.json() as { qrDataUrl?: string; totalAmount?: number; currency?: string; expiresAt?: string; error?: string; expired?: boolean };
        if (!started.ok || !startedBody.qrDataUrl) { if (startedBody.expired) resetAttempt(); setError(startedBody.error ?? "No pudimos generar el QR de pago."); return; }
        setQr({ orderPublicId: attempt.current.orderPublicId, qrDataUrl: startedBody.qrDataUrl, totalAmount: startedBody.totalAmount ?? quote.total_amount, currency: startedBody.currency ?? quote.currency, expiresAt: startedBody.expiresAt ?? "" });
        return;
      }
      const confirmed = await fetch("/api/pos/box-office/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        orderPublicId: attempt.current.orderPublicId, paymentMethod: method as BoxOfficePaymentMethod,
        cashReceivedAmount: method === "cash" ? received : null, externalReference: reference || null,
      }) });
      const body = await confirmed.json() as ConfirmedSale & { error?: string; expired?: boolean };
      if (!confirmed.ok) { if (body.expired) resetAttempt(); setError(body.error ?? "No pudimos confirmar el cobro."); return; }
      setDone(body);
    } catch { setError("Sin conexión. Verificá si la venta quedó registrada antes de reintentar."); }
    finally { setPending(false); }
  }

  if (onlineLink && !done) {
    return <main className="grid min-h-[70dvh] place-items-center p-5"><section className="w-full max-w-md text-center">
      <p className="eyebrow">Comprar entrada online</p>
      <h1 className="mt-2 text-3xl font-black">Escaneá para comprar</h1>
      <p className="mt-2 rounded-xl bg-[var(--foreground)] px-3 py-2 text-sm font-bold text-[var(--background)]">Usá la cámara del celular. No lo escanees desde la app de Mercado Pago.</p>
      <Image src={onlineLink.qrDataUrl} alt="QR para comprar la entrada" width={288} height={288} unoptimized className="mx-auto mt-5 size-72 rounded-2xl bg-white p-2"/>
      <p className="mt-4 text-sm leading-6 text-neutral-500">El comprador abre el QR con su celular, completa sus datos y paga con Mercado Pago. La entrada le llega al instante a su celular y por email.</p>
      <p className="mt-3 rounded-xl border border-[var(--border)] p-3 text-sm font-bold">{onlineLink.quantity} × {onlineLink.ticketName} · {formatMoney(onlineLink.unitPrice, onlineLink.currency)} c/u + cargo de servicio</p>
      <p className="mt-2 text-xs text-neutral-600">Esta venta no pasa por la caja: cuando pague, aparece en las ventas del evento.</p>
      <OnlineQrStatus ticketTypeId={onlineLink.ticketTypeId} since={onlineLink.shownAt}/>
      <button className="btn btn-primary mt-6 min-h-14 w-full" onClick={newSale}>Nueva venta</button>
    </section></main>;
  }

  if (qr && !done) {
    return <QrPayment qr={qr} onPaid={(paid) => setDone(paid)} onChangeMethod={() => { setQr(null); setMethod(methods[0] ?? "cash"); }} onRetry={(next) => setQr(next)} onCancelled={newSale} onExpired={newSale}/>;
  }

  if (done) {
    return <main className="grid min-h-[70dvh] place-items-center p-5"><section className="w-full max-w-md text-center">
      <span className="mx-auto grid size-16 place-items-center rounded-full bg-[var(--foreground)] text-[var(--background)]"><Check size={32}/></span>
      <p className="eyebrow mt-6">{boxOfficeDisplayLabels[done.sale.payment_method] ?? done.sale.payment_method}</p>
      <h1 className="mt-2 text-4xl font-black">{formatMoney(done.sale.total_amount, done.sale.currency)}</h1>
      {done.sale.payment_method === "cash" && <p className="mt-4 rounded-xl border border-[var(--border)] p-4 font-bold">Vuelto {formatMoney(done.sale.change_amount, done.sale.currency)}</p>}
      {done.ticketsIssued
        ? <><Image src={done.ticketQrDataUrl} alt="QR para abrir la entrada" width={224} height={224} unoptimized className="mx-auto mt-6 size-56 rounded-2xl bg-white p-2"/><p className="mt-3 text-xs text-neutral-500">El comprador escanea este código con su celular para ver y guardar sus entradas.{done.emailed ? " También se las enviamos por email." : ""}</p>
          <a className="btn btn-secondary mt-4 min-h-12 w-full" href={done.ticketUrl} target="_blank" rel="noreferrer"><ExternalLink size={16}/>Mostrar entrada en esta pantalla</a></>
        : <p className="status-danger mt-6 rounded-xl p-4 text-sm font-bold">El cobro quedó registrado pero las entradas todavía no se emitieron. Abrí la venta desde el panel del productor o reintentá en unos segundos.</p>}
      <button className="btn btn-primary mt-6 min-h-14 w-full" onClick={newSale}>Nueva venta</button>
    </section></main>;
  }

  return <div className="mx-auto grid max-w-[1500px] gap-5 p-4 lg:grid-cols-[1fr_400px] lg:p-6">
    <section>
      <p className="eyebrow">Entradas</p>
      {catalog.length === 0 && <div className="card mt-4 p-10 text-center text-sm text-neutral-500">No hay entradas habilitadas para taquilla.</div>}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {catalog.map((ticket) => {
          const unavailable = !ticket.sale_open || ticket.available_quantity < 1;
          const active = selected?.ticket_type_id === ticket.ticket_type_id;
          return <button key={ticket.ticket_type_id} disabled={unavailable} onClick={() => pick(ticket)} className={`card flex min-h-32 flex-col justify-between p-4 text-left ${active ? "ring-2 ring-[var(--foreground)]" : "card-interactive"} ${unavailable ? "opacity-40" : ""}`}>
            <span className="flex items-center gap-2 text-lg font-black leading-tight"><Ticket size={18}/>{ticket.name}</span>
            <span><span className="block text-2xl font-black">{formatMoney(ticket.unit_price_amount, ticket.currency)}</span>
              <span className="mt-1 block text-xs text-neutral-500">{unavailable ? (ticket.available_quantity < 1 ? "Agotada" : "No disponible") : `${ticket.available_quantity} disponibles`}{ticket.unit_price_amount !== ticket.online_price_amount ? ` · online ${formatMoney(ticket.online_price_amount, ticket.currency)}` : ""}</span></span>
          </button>;
        })}
      </div>
    </section>

    <aside className="card h-fit p-5 lg:sticky lg:top-24">
      {!selected ? <p className="py-8 text-sm text-neutral-500">Tocá una entrada para empezar la venta.</p> : <div className="grid gap-4">
        <div className="flex items-center justify-between gap-3"><div><p className="eyebrow">Venta actual</p><p className="mt-1 text-lg font-black">{selected.name}</p></div>
          <div className="flex items-center gap-1"><button className="grid size-11 place-items-center rounded-xl border border-[var(--border)]" onClick={() => changeQuantity(quantity - 1)} aria-label="Menos"><Minus size={16}/></button><span className="w-10 text-center text-xl font-black">{quantity}</span><button className="grid size-11 place-items-center rounded-xl border border-[var(--border)]" onClick={() => changeQuantity(quantity + 1)} aria-label="Más"><Plus size={16}/></button></div></div>
        {quote ? <div className="grid gap-1.5 rounded-xl border border-[var(--border)] p-4 text-sm">
          <div className="flex justify-between"><span className="text-neutral-500">Entradas</span><span>{formatMoney(quote.subtotal_amount, quote.currency)}</span></div>
          <div className="flex justify-between"><span className="text-neutral-500">Cargo ENPASS</span><span>{formatMoney(quote.service_fee_amount, quote.currency)}</span></div>
          <div className="mt-1 flex items-end justify-between border-t border-[var(--border)] pt-2"><span className="text-xs font-bold uppercase text-neutral-500">Total</span><strong className="text-3xl">{formatMoney(quote.total_amount, quote.currency)}</strong></div></div>
          : <p className="text-sm text-neutral-500">Calculando…</p>}
        <div className="grid grid-cols-3 gap-2">{payMethods.map((item) => { const Icon = item === "online" ? Smartphone : item === "mp_qr" ? QrCode : methodIcons[item]; return <button key={item} onClick={() => setMethod(item)} className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border text-xs font-black ${method === item ? "border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]" : "border-[var(--border)]"}`}><Icon size={17}/>{item === "online" ? "Pagar online (QR)" : item === "mp_qr" ? "Cobrar con QR" : boxOfficeChipLabels[item]}</button>; })}</div>
        {method === "mp_qr" ? <p className="rounded-xl border border-[var(--border)] p-3 text-xs leading-5 text-neutral-500">Vas a mostrar un QR de pago. La entrada se emite recién cuando Mercado Pago confirma el pago (vence en {config.qr_expiry_minutes} min).</p> : method === "online" ? <p className="rounded-xl border border-[var(--border)] p-3 text-xs leading-5 text-neutral-500">Le mostrás un QR: el comprador entra a la compra online con la entrada ya elegida, completa sus datos y paga con Mercado Pago. Si el precio de puerta es distinto del online, se usa la &ldquo;Entrada por link&rdquo; de ese precio.</p> : method === "cash" ? <div className="grid gap-2"><label className="label">Recibido<input className="field h-14 text-xl font-black" type="number" min="0" step="1" inputMode="numeric" value={receivedPesos} onChange={(event) => setReceivedPesos(event.target.value)} placeholder={quote ? String(Math.ceil(quote.total_amount / 100)) : "0"}/></label>
          <div className="flex items-center justify-between rounded-xl border border-[var(--border)] p-3"><span className="text-sm font-bold text-neutral-500">Vuelto</span><strong className="text-xl">{formatMoney(change, quote?.currency ?? "ARS")}</strong></div></div>
          : <label className="label">Referencia <span className="font-normal text-neutral-600">(opcional)</span><input className="field" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Nº de operación"/><span className="text-xs font-normal text-neutral-600">Esto emite la entrada YA como cobrada. Usalo solo si el dinero ya llegó. Para que el cliente pague, usá &ldquo;Pagar online (QR)&rdquo;.</span></label>}
        {method !== "online" && <div className="grid gap-2 rounded-xl border border-[var(--border)] p-3 text-sm"><p className="font-bold">Datos del comprador <span className="font-normal text-neutral-500">(obligatorios)</span></p>
          <div className="grid grid-cols-2 gap-2"><input className="field" placeholder="Nombre" autoComplete="off" value={buyer.firstName} onChange={(event) => setBuyer({ ...buyer, firstName: event.target.value })}/><input className="field" placeholder="Apellido" autoComplete="off" value={buyer.lastName} onChange={(event) => setBuyer({ ...buyer, lastName: event.target.value })}/></div>
          <input className="field" placeholder="DNI" inputMode="numeric" autoComplete="off" value={buyer.document} onChange={(event) => setBuyer({ ...buyer, document: event.target.value })}/><input className="field" type="email" placeholder="Email (recibe las entradas)" autoComplete="off" value={buyer.email} onChange={(event) => setBuyer({ ...buyer, email: event.target.value })}/>
          {!buyerValid && <p className="text-xs text-neutral-500">Completá nombre, apellido, DNI (7 u 8 números) y un email válido para poder cobrar.</p>}</div>}
        {error && <p className="status-danger rounded-xl p-3 text-sm font-bold">{error}</p>}
        <button className="btn btn-primary min-h-14" onClick={() => void charge()} disabled={!canCharge}>{pending ? (method === "mp_qr" ? "Generando QR…" : "Registrando…") : !online ? "Sin conexión" : method === "online" ? "Mostrar QR de compra" : method === "mp_qr" ? "Cobrar con QR" : "Confirmar cobro"}</button>
        <p className="text-center text-xs text-neutral-600">{method === "online" ? "Cuando el comprador paga online, la entrada se emite sola." : method === "mp_qr" ? "El QR de pago no es la entrada: la entrada se genera después de pagar." : "Las entradas se emiten recién al confirmar el cobro."}</p>
      </div>}
    </aside>
  </div>;
}


function QrPayment({ qr, onPaid, onChangeMethod, onRetry, onCancelled, onExpired }: {
  qr: QrData; onPaid: (sale: ConfirmedSale) => void; onChangeMethod: () => void; onRetry: (qr: QrData) => void; onCancelled: () => void; onExpired: () => void;
}) {
  const [state, setState] = useState<OrderStatusBody | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [busy, setBusy] = useState<null | "verify" | "retry" | "cancel">(null);
  const [message, setMessage] = useState<string | null>(null);

  function apply(body: OrderStatusBody) {
    setState(body);
    setSecondsLeft(body.status.seconds_left);
    if (body.status.order_status === "paid" && body.ticketUrl && body.ticketQrDataUrl) {
      onPaid({ sale: { order_public_id: qr.orderPublicId, total_amount: body.status.total_amount, service_fee_amount: 0, currency: qr.currency, payment_method: "mercado_pago", cash_received_amount: null, change_amount: 0 }, ticketsIssued: body.ticketsIssued, emailed: false, ticketUrl: body.ticketUrl, ticketQrDataUrl: body.ticketQrDataUrl });
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const response = await fetch(`/api/pos/box-office/status?order=${qr.orderPublicId}`, { cache: "no-store" });
        if (!response.ok || cancelled) return;
        apply(await response.json() as OrderStatusBody);
      } catch { /* Keep polling: the cashier can still verify manually. */ }
    }
    void poll();
    const timer = setInterval(() => void poll(), 2500);
    const clock = setInterval(() => setSecondsLeft((current) => (current === null ? current : Math.max(0, current - 1))), 1000);
    return () => { cancelled = true; clearInterval(timer); clearInterval(clock); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qr.orderPublicId]);

  async function call(kind: "verify" | "cancel") {
    setBusy(kind); setMessage(null);
    try {
      const response = await fetch(`/api/pos/box-office/${kind}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderPublicId: qr.orderPublicId }) });
      const body = await response.json() as OrderStatusBody & { cancelled?: boolean; error?: string };
      if (!response.ok) { setMessage(body.error ?? "No pudimos completar la acción."); return; }
      if (kind === "cancel") { onCancelled(); return; }
      apply(body);
      if (body.status.order_status === "pending") setMessage("Todavía no hay un pago aprobado en Mercado Pago.");
    } catch { setMessage("Sin conexión. Reintentá."); }
    finally { setBusy(null); }
  }

  async function retry() {
    setBusy("retry"); setMessage(null);
    try {
      const response = await fetch("/api/pos/box-office/qr", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderPublicId: qr.orderPublicId }) });
      const body = await response.json() as { qrDataUrl?: string; totalAmount?: number; currency?: string; expiresAt?: string; error?: string };
      if (!response.ok || !body.qrDataUrl) { setMessage(body.error ?? "No pudimos generar un QR nuevo."); return; }
      onRetry({ orderPublicId: qr.orderPublicId, qrDataUrl: body.qrDataUrl, totalAmount: body.totalAmount ?? qr.totalAmount, currency: body.currency ?? qr.currency, expiresAt: body.expiresAt ?? qr.expiresAt });
    } catch { setMessage("Sin conexión. Reintentá."); }
    finally { setBusy(null); }
  }

  const orderStatus = state?.status.order_status;
  const rejected = orderStatus === "pending" && state?.status.payment_status === "rejected";
  const inReview = orderStatus === "pending" && state?.status.payment_status === "processing";
  const minutes = secondsLeft === null ? null : `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`;

  if (orderStatus === "expired" || orderStatus === "cancelled") {
    return <main className="grid min-h-[70dvh] place-items-center p-5"><section className="w-full max-w-md text-center"><p className="eyebrow">QR vencido</p><h1 className="mt-3 text-3xl font-black">{orderStatus === "expired" ? "La operación venció" : "Operación cancelada"}</h1><p className="mt-3 text-sm text-neutral-500">Se liberó el stock reservado. Ese QR ya no sirve.</p><button className="btn btn-primary mt-6 min-h-14 w-full" onClick={onExpired}>Nueva venta</button></section></main>;
  }

  return <main className="grid min-h-[70dvh] place-items-center p-5"><section className="w-full max-w-md text-center">
    {rejected ? <><span className="mx-auto grid size-16 place-items-center rounded-full bg-red-500/15 text-red-400"><X size={32}/></span><h1 className="mt-5 text-3xl font-black">Pago rechazado</h1><p className="mt-2 text-sm text-neutral-500">No se generó ninguna entrada. Podés reintentar con un QR nuevo o cambiar el medio de pago.</p></>
      : <><p className="eyebrow">Total</p><h1 className="mt-2 text-5xl font-black">{formatMoney(qr.totalAmount, qr.currency)}</h1><p className="mt-2 text-sm font-bold">Escaneá para pagar</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr.qrDataUrl} alt="QR de pago" className="mx-auto mt-4 size-64 rounded-2xl bg-white p-2"/>
        <p className="mt-4 flex items-center justify-center gap-2 text-sm text-neutral-500"><LoaderCircle size={16} className="animate-spin"/>{inReview ? "Pago en revisión…" : "Esperando pago…"}{minutes ? ` · vence en ${minutes}` : ""}</p></>}
    {message && <p className="status-danger mt-4 rounded-xl p-3 text-sm font-bold">{message}</p>}
    <div className="mt-6 grid gap-2">
      {rejected && <button className="btn btn-primary min-h-14" onClick={() => void retry()} disabled={busy !== null}>{busy === "retry" ? "Generando…" : "Reintentar"}</button>}
      <button className="btn btn-secondary min-h-12" onClick={() => void call("verify")} disabled={busy !== null}>{busy === "verify" ? "Verificando…" : "Ya pagó / Verificar pago"}</button>
      <button className="btn btn-ghost min-h-12" onClick={onChangeMethod} disabled={busy !== null}>Cambiar medio de pago</button>
      <button className="btn btn-ghost min-h-12 text-red-300" onClick={() => void call("cancel")} disabled={busy !== null}>Cancelar operación</button>
    </div>
    <p className="mt-4 text-xs text-neutral-600">Este QR es solo para pagar. La entrada aparece cuando Mercado Pago confirma.</p>
  </section></main>;
}


type OnlineActivity = { pending: number; paid: Array<{ orderPublicId: string; quantity: number; buyerName: string; at: string }> };
const clock = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit" });

// Closure for the online QR: shows in real time whether someone is paying and whether the payment was confirmed.
function OnlineQrStatus({ ticketTypeId, since }: { ticketTypeId: string; since: string }) {
  const [activity, setActivity] = useState<OnlineActivity | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const response = await fetch(`/api/pos/box-office/online-activity?ticket=${ticketTypeId}&since=${encodeURIComponent(since)}`, { cache: "no-store" });
        if (cancelled) return;
        if (!response.ok) { setFailed(true); return; }
        setActivity(await response.json() as OnlineActivity); setFailed(false);
      } catch { if (!cancelled) setFailed(true); }
    }
    void poll();
    const timer = setInterval(() => void poll(), 3000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [ticketTypeId, since]);

  if (activity && activity.paid.length > 0) {
    return <div className="mt-5 rounded-2xl border border-emerald-400/40 bg-emerald-400/[.12] p-4 text-left">
      <p className="text-lg font-black text-emerald-700">✅ PAGO CONFIRMADO</p>
      {activity.paid.map((sale) => <p key={sale.orderPublicId} className="mt-1 text-sm font-bold">{sale.quantity} × entrada · {sale.buyerName} · {clock.format(new Date(sale.at))}</p>)}
      <p className="mt-2 text-xs text-neutral-600">La entrada le llegó al celular del comprador y por email. Ya podés hacer una nueva venta.</p>
    </div>;
  }
  return <div className="mt-5 rounded-2xl border border-[var(--border)] p-4 text-left text-sm">
    {activity && activity.pending > 0
      ? <p className="font-black text-amber-600">🟡 {activity.pending === 1 ? "Un comprador está pagando ahora…" : `${activity.pending} compradores están pagando ahora…`}</p>
      : <p className="font-bold text-neutral-500">⏳ Esperando que el comprador escanee y pague…</p>}
    {failed && <p className="mt-1 text-xs text-red-500">No pudimos actualizar el estado. Reintentando…</p>}
    <p className="mt-2 text-xs text-neutral-500">Se actualiza solo. Si el pago se confirma, aparece acá en verde. Si no aparece nada y el cliente ya pagó, revisá en Taquilla o en Entradas → Ventas.</p>
  </div>;
}
