import Image from "next/image";
import QRCode from "qrcode";
import { Link2 } from "lucide-react";
import type { TicketType } from "@/shared/database/types";
import { formatMoney } from "@/shared/lib/format";
import { SubmitButton } from "@/shared/ui/submit-button";
import { createLinkTicketType, deleteLinkTicketType, setLinkTicketActive } from "../application/link-ticket-actions";
import { CopyLinkButton, DownloadQrButton } from "./copy-link-button";

const when = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" });

export async function LinkTicketsCard({ eventId, slug, siteUrl, ticketTypes, sold, notice, error }: {
  eventId: string; slug: string; siteUrl: string; ticketTypes: TicketType[]; sold: Record<string, number>; notice?: string; error?: string;
}) {
  const items = await Promise.all(ticketTypes.map(async (type) => {
    const url = `${siteUrl}/e/${slug}/entrada/${type.link_token}`;
    const [qr, qrLarge] = await Promise.all([
      QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 1, width: 240 }),
      QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 4, width: 1000 }),
    ]);
    return { type, url, qr, qrLarge };
  }));
  return <div className="card p-5 sm:p-7">
    <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-[var(--accent)] text-[var(--on-accent)]"><Link2 size={18}/></span><div><h2 className="section-title">Entradas por link</h2><p className="text-sm text-neutral-500">No aparecen en la página del evento. Se compran solo con su link o QR, dentro del horario que elijas.</p></div></div>
    {notice && <p className="status-success mt-4 rounded-xl p-3 text-sm">{notice}</p>}
    {error && <p className="status-danger mt-4 rounded-xl p-3 text-sm font-bold">{error}</p>}
    <div className="mt-5 grid gap-4">
      {items.map(({ type, url, qr, qrLarge }) => <article key={type.id} className="rounded-[1.15rem] border border-white/[.08] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-black">{type.name}{!type.active && <span className="ml-2 text-xs font-bold text-red-400">DESACTIVADA</span>}</p>
          <p className="mt-1 text-sm text-neutral-500">{formatMoney(type.price_amount, type.currency)} · {sold[type.id] ?? 0} vendidas de {type.quantity}</p>
          <p className="mt-1 text-xs text-neutral-500">Desde: {type.sales_start ? when.format(new Date(type.sales_start)) : "ya habilitada"} · Hasta: {type.sales_end ? when.format(new Date(type.sales_end)) : "sin límite"}</p></div>
          <Image src={qr} alt={`QR de ${type.name}`} width={96} height={96} unoptimized className="size-24 rounded-lg bg-white p-1"/></div>
        <p className="mt-3 break-all rounded-lg bg-black/25 p-2 font-mono text-[11px] text-neutral-400">{url}</p>
        <div className="mt-3 flex flex-wrap gap-2"><CopyLinkButton value={url}/><DownloadQrButton href={qrLarge} filename={`qr-${type.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "entrada"}.png`}/>
          <form action={setLinkTicketActive}><input type="hidden" name="eventId" value={eventId}/><input type="hidden" name="ticketTypeId" value={type.id}/><input type="hidden" name="active" value={String(!type.active)}/><SubmitButton className="btn btn-ghost" pendingLabel="…">{type.active ? "Desactivar" : "Reactivar"}</SubmitButton></form>
          <form action={deleteLinkTicketType}><input type="hidden" name="eventId" value={eventId}/><input type="hidden" name="ticketTypeId" value={type.id}/><SubmitButton className="btn btn-ghost text-red-300" pendingLabel="…">Eliminar</SubmitButton></form></div>
        <p className="mt-3 rounded-lg bg-amber-300/[.08] p-2 text-xs font-bold leading-5 text-amber-200">Este QR se escanea con la cámara normal del celular (no desde la app de Mercado Pago): abre la compra y ahí se paga.</p>
        <p className="mt-3 text-xs leading-5 text-neutral-500">Para que el escáner la acepte, tildá esta entrada en la puerta correspondiente (pestaña Accesos).</p>
      </article>)}
      {items.length === 0 && <p className="text-sm text-neutral-500">Todavía no creaste ninguna.</p>}
    </div>
    <form action={createLinkTicketType} className="mt-5 grid gap-3 rounded-[1.15rem] border border-white/[.08] p-4">
      <input type="hidden" name="eventId" value={eventId}/>
      <p className="text-sm font-bold text-neutral-300">+ Nueva entrada por link</p>
      <label className="label">Nombre<input className="field" name="name" placeholder="Entrada de taquilla" required maxLength={100}/></label>
      <div className="grid gap-3 sm:grid-cols-3"><label className="label">Precio ($)<input className="field" name="pricePesos" type="number" min="0" step="1" required/></label><label className="label">Cantidad<input className="field" name="quantity" type="number" min="1" step="1" required/></label><label className="label">Máx. por compra<input className="field" name="maxPerOrder" type="number" min="1" max="20" defaultValue="4" required/></label></div>
      <div className="grid gap-3 sm:grid-cols-2"><label className="label">Se habilita desde <span className="font-normal text-neutral-600">(hora de Argentina, opcional)</span><input className="field" name="salesStart" type="datetime-local"/></label><label className="label">Hasta <span className="font-normal text-neutral-600">(opcional)</span><input className="field" name="salesEnd" type="datetime-local"/></label></div>
      <SubmitButton className="btn btn-primary w-fit" pendingLabel="Creando…">Crear entrada por link</SubmitButton>
    </form>
  </div>;
}
