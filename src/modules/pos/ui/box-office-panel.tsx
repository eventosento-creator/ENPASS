"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Banknote, Check, CreditCard, ExternalLink, Landmark, Minus, MoreHorizontal, Plus, QrCode, Ticket } from "lucide-react";
import { formatMoney } from "@/shared/lib/format";
import { boxOfficeMethodLabels, enabledBoxOfficeMethods, type BoxOfficeConfig, type BoxOfficePaymentMethod, type BoxOfficeQuote, type BoxOfficeTicketType } from "../domain/box-office";

type ConfirmedSale = {
  sale: { order_public_id: string; total_amount: number; service_fee_amount: number; currency: string; payment_method: BoxOfficePaymentMethod; cash_received_amount: number | null; change_amount: number };
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
  const [method, setMethod] = useState<BoxOfficePaymentMethod>(methods[0] ?? "cash");
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

  function resetAttempt() { attempt.current = { key: crypto.randomUUID(), orderPublicId: null }; }
  function pick(ticket: BoxOfficeTicketType) { setSelected(ticket); setQuantity(1); setError(null); setReceivedPesos(""); resetAttempt(); }
  function changeQuantity(next: number) {
    if (!selected) return;
    const max = Math.max(1, Math.min(selected.max_per_order, selected.available_quantity));
    setQuantity(Math.min(max, Math.max(1, next))); resetAttempt();
  }
  function newSale() { setDone(null); setSelected(null); setQuantity(1); setReceivedPesos(""); setReference(""); setBuyer({ firstName: "", lastName: "", document: "", email: "", phone: "" }); setError(null); resetAttempt(); onSold(); }

  const received = Math.round(Number(receivedPesos) * 100);
  const change = quote && method === "cash" ? Math.max(0, received - quote.total_amount) : 0;
  const canCharge = Boolean(quote) && online && !pending && (method !== "cash" || received >= (quote?.total_amount ?? 0));

  async function charge() {
    if (!selected || !quote || pending) return;
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
      const confirmed = await fetch("/api/pos/box-office/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        orderPublicId: attempt.current.orderPublicId, paymentMethod: method,
        cashReceivedAmount: method === "cash" ? received : null, externalReference: reference || null,
      }) });
      const body = await confirmed.json() as ConfirmedSale & { error?: string; expired?: boolean };
      if (!confirmed.ok) { if (body.expired) resetAttempt(); setError(body.error ?? "No pudimos confirmar el cobro."); return; }
      setDone(body);
    } catch { setError("Sin conexión. Verificá si la venta quedó registrada antes de reintentar."); }
    finally { setPending(false); }
  }

  if (done) {
    return <main className="grid min-h-[70dvh] place-items-center p-5"><section className="w-full max-w-md text-center">
      <span className="mx-auto grid size-16 place-items-center rounded-full bg-[var(--foreground)] text-[var(--background)]"><Check size={32}/></span>
      <p className="eyebrow mt-6">{boxOfficeMethodLabels[done.sale.payment_method]}</p>
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
        <div className="grid grid-cols-3 gap-2">{methods.map((item) => { const Icon = methodIcons[item]; return <button key={item} onClick={() => setMethod(item)} className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border text-xs font-black ${method === item ? "border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]" : "border-[var(--border)]"}`}><Icon size={17}/>{boxOfficeMethodLabels[item]}</button>; })}</div>
        {method === "cash" ? <div className="grid gap-2"><label className="label">Recibido<input className="field h-14 text-xl font-black" type="number" min="0" step="1" inputMode="numeric" value={receivedPesos} onChange={(event) => setReceivedPesos(event.target.value)} placeholder={quote ? String(Math.ceil(quote.total_amount / 100)) : "0"}/></label>
          <div className="flex items-center justify-between rounded-xl border border-[var(--border)] p-3"><span className="text-sm font-bold text-neutral-500">Vuelto</span><strong className="text-xl">{formatMoney(change, quote?.currency ?? "ARS")}</strong></div></div>
          : <label className="label">Referencia <span className="font-normal text-neutral-600">(opcional)</span><input className="field" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Nº de operación"/><span className="text-xs font-normal text-neutral-600">Confirmá recién cuando verifiques el cobro en la terminal o app.</span></label>}
        <details className="rounded-xl border border-[var(--border)] p-3 text-sm"><summary className="cursor-pointer font-bold">Datos del comprador (opcional)</summary>
          <div className="mt-3 grid gap-3"><div className="grid grid-cols-2 gap-2"><input className="field" placeholder="Nombre" value={buyer.firstName} onChange={(event) => setBuyer({ ...buyer, firstName: event.target.value })}/><input className="field" placeholder="Apellido" value={buyer.lastName} onChange={(event) => setBuyer({ ...buyer, lastName: event.target.value })}/></div>
            <input className="field" placeholder="DNI (para la factura)" inputMode="numeric" value={buyer.document} onChange={(event) => setBuyer({ ...buyer, document: event.target.value })}/><input className="field" type="email" placeholder="Email (recibe las entradas)" value={buyer.email} onChange={(event) => setBuyer({ ...buyer, email: event.target.value })}/></div></details>
        {error && <p className="status-danger rounded-xl p-3 text-sm font-bold">{error}</p>}
        <button className="btn btn-primary min-h-14" onClick={() => void charge()} disabled={!canCharge}>{pending ? "Registrando…" : !online ? "Sin conexión" : "Confirmar cobro"}</button>
        <p className="text-center text-xs text-neutral-600">Las entradas se emiten recién al confirmar el cobro.</p>
      </div>}
    </aside>
  </div>;
}
