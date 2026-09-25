import { notFound } from "next/navigation";
import { createAdminClient } from "@/shared/database/admin";
import { createClient } from "@/shared/database/server";
import { formatMoney } from "@/shared/lib/format";
import { getEventCapabilities } from "@/modules/events/domain/event-profile";
import { getEventViewerRole } from "@/modules/events/application/viewer";
import { EventSectionNav } from "@/modules/events/ui/event-section-nav";
import { addBoxOfficeStaff, enableBoxOfficeModule, removeBoxOfficeStaff, saveBoxOfficePrice, saveBoxOfficeSettings, voidBoxOfficeSale } from "@/modules/pos/application/box-office-actions";
import { boxOfficeMethodLabels, type BoxOfficePaymentMethod } from "@/modules/pos/domain/box-office";
import { SubmitButton } from "@/shared/ui/submit-button";
import { BoxOfficeDevices } from "@/modules/pos/ui/box-office-devices";
import { getCashierOptions } from "@/modules/pos/application/cashier-options";

const dateTime = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" });

function toLocalInput(value: string | null) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  return parts.replace(" ", "T");
}

export default async function BoxOfficePage({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<{ notice?: string; error?: string }> }) {
  const [{ eventId }, query] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("*").eq("id", eventId).single();
  if (!event) notFound();
  if ((await getEventViewerRole(event.organization_id)) !== "manager") notFound();
  const capabilities = getEventCapabilities(event);

  const [{ data: settings }, { data: ticketTypes }, { data: channelPrices }, { data: staff }, { data: summary }, { data: registers }, { data: sales }, { data: locations }, { data: deviceRows }, cashierOptions] = await Promise.all([
    supabase.from("event_box_office_settings").select("*").eq("event_id", eventId).maybeSingle(),
    supabase.from("ticket_types").select("id, name, price_amount, currency, active").eq("event_id", eventId).order("sort_order"),
    supabase.from("ticket_type_channel_prices").select("*").eq("event_id", eventId).eq("channel", "box_office"),
    supabase.from("box_office_staff").select("user_id, role").eq("event_id", eventId),
    supabase.rpc("get_box_office_summary", { target_event: eventId }),
    supabase.rpc("get_box_office_registers", { target_event: eventId }),
    supabase.rpc("get_box_office_sales", { target_event: eventId, target_limit: 30 }),
    supabase.from("sales_locations").select("id, name").eq("event_id", eventId).order("sort_order"),
    supabase.from("pos_device_authorizations").select("id, sales_location_id, name, status, cashier_user_id").eq("event_id", eventId).order("created_at", { ascending: false }),
    getCashierOptions(supabase, eventId, event.organization_id),
  ]);
  const cashierLabelById = new Map(cashierOptions.map((option) => [option.id, option.label]));
  const devices = (deviceRows ?? []).map((device) => ({ id: device.id, sales_location_id: device.sales_location_id, name: device.name, status: device.status, cashier_label: device.cashier_user_id ? cashierLabelById.get(device.cashier_user_id) ?? null : null }));

  const admin = createAdminClient();
  const staffRows = await Promise.all((staff ?? []).map(async (member) => {
    const { data } = await admin.auth.admin.getUserById(member.user_id);
    return { ...member, email: data?.user?.email ?? "Usuario" };
  }));
  const priceByType = new Map((channelPrices ?? []).map((row) => [row.ticket_type_id, row]));
  const cfg = settings ?? { enabled: false, cash_enabled: true, qr_enabled: false, debit_enabled: false, credit_enabled: false, transfer_enabled: false, other_enabled: false, allow_after_start: true, closes_at: null };
  const currency = event.currency;
  const totals = (summary ?? []).reduce((sum, row) => ({
    tickets: sum.tickets + row.ticket_count, gmv: sum.gmv + row.gmv_amount, fee: sum.fee + row.service_fee_amount,
    cash: sum.cash + row.cash_amount, digital: sum.digital + row.digital_amount,
  }), { tickets: 0, gmv: 0, fee: 0, cash: 0, digital: 0 });

  return <>
    <div><p className="eyebrow">{event.name}</p><h1 className="page-title mt-2">Taquilla</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-500">Venta presencial en puerta con caja, cajeros y arqueo. Usa el mismo stock y las mismas entradas con QR que la venta online.</p></div>
    <EventSectionNav eventId={eventId} active="boxoffice" capabilities={capabilities} profile={event.profile}/>
    {query.notice && <p className="card mt-6 p-4 text-sm font-bold">{query.notice}</p>}
    {query.error && <p className="status-danger mt-6 rounded-xl p-4 text-sm font-bold">{query.error}</p>}
    {!event.pos_enabled && <section className="card mt-7 p-5 sm:p-7"><h2 className="section-title">Activá la caja para vender en puerta</h2><p className="mt-2 max-w-xl text-sm leading-6 text-neutral-500">La taquilla usa el módulo de caja (POS) del evento, que hoy está apagado. Activarlo no cambia nada de lo que ya tenés cargado.</p><form action={enableBoxOfficeModule} className="mt-5"><input type="hidden" name="eventId" value={eventId}/><SubmitButton className="btn btn-primary" pendingLabel="Activando…">Activar caja</SubmitButton></form></section>}

    <section className="card mt-7 p-5 sm:p-7">
      <p className="eyebrow">Configuración</p><h2 className="section-title mt-2">Taquilla del evento</h2>
      <form action={saveBoxOfficeSettings} className="mt-5 grid gap-4">
        <input type="hidden" name="eventId" value={eventId}/>
        <label className="flex items-center gap-3 font-bold"><input type="checkbox" name="enabled" defaultChecked={cfg.enabled} className="size-5"/>Taquilla habilitada</label>
        <div><p className="text-xs font-bold uppercase text-neutral-600">Medios de pago</p><div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {([["cash", "cash_enabled", "cash"], ["qr", "qr_enabled", "qr"], ["debit", "debit_enabled", "debit_card"], ["credit", "credit_enabled", "credit_card"], ["transfer", "transfer_enabled", "bank_transfer"], ["other", "other_enabled", "other"]] as const).map(([name, key, method]) => (
            <label key={name} className="flex items-center gap-2"><input type="checkbox" name={name} defaultChecked={cfg[key]} className="size-4"/>{boxOfficeMethodLabels[method]}</label>
          ))}
        </div></div>
        <label className="flex items-center gap-3 text-sm"><input type="checkbox" name="allowAfterStart" defaultChecked={cfg.allow_after_start} className="size-4"/>Permitir vender después de la hora de inicio</label>
        <label className="label max-w-xs">Cierre de taquilla <span className="font-normal text-neutral-600">(opcional, hora de Argentina)</span><input className="field" type="datetime-local" name="closesAt" defaultValue={toLocalInput(cfg.closes_at)}/></label>
        <SubmitButton className="btn btn-primary w-fit" pendingLabel="Guardando…">Guardar configuración</SubmitButton>
      </form>
    </section>

    <section className="card mt-7 p-5 sm:p-7">
      <p className="eyebrow">Cajas</p><h2 className="section-title mt-2">Cajas y códigos de activación</h2>
      <p className="mt-2 text-sm text-neutral-500">Creá una caja, generá su código y cargalo en el celular o tablet del cajero (en enpass.com.ar/pos).</p>
      <BoxOfficeDevices eventId={eventId} locations={locations ?? []} devices={devices} cashierOptions={cashierOptions} published={event.status === "published" || event.status === "sold_out"}/>
    </section>

    <section className="card mt-7 p-5 sm:p-7">
      <p className="eyebrow">Precios</p><h2 className="section-title mt-2">Precio de puerta por entrada</h2>
      <p className="mt-2 text-sm text-neutral-500">Si dejás el precio vacío se vende al precio online. El cargo de servicio se calcula sobre el precio de puerta.</p>
      <div className="mt-5 grid gap-3">{(ticketTypes ?? []).filter((type) => type.active).map((type) => {
        const row = priceByType.get(type.id);
        return <form key={type.id} action={saveBoxOfficePrice} className="grid items-end gap-3 rounded-xl border border-[var(--border)] p-4 sm:grid-cols-[1fr_180px_auto_auto]">
          <input type="hidden" name="eventId" value={eventId}/><input type="hidden" name="ticketTypeId" value={type.id}/>
          <div><p className="font-bold">{type.name}</p><p className="text-xs text-neutral-500">Online: {formatMoney(type.price_amount, type.currency)}</p></div>
          <label className="label">Precio puerta ($)<input className="field" name="pricePesos" type="number" min="0" step="1" defaultValue={row ? row.price_amount / 100 : ""} placeholder="Igual que online"/></label>
          <label className="flex items-center gap-2 pb-3 text-sm"><input type="checkbox" name="enabled" defaultChecked={row ? row.enabled : true} className="size-4"/>Se vende en taquilla</label>
          <SubmitButton className="btn btn-secondary" pendingLabel="…">Guardar</SubmitButton>
        </form>;
      })}</div>
    </section>

    <section className="card mt-7 p-5 sm:p-7">
      <p className="eyebrow">Personal</p><h2 className="section-title mt-2">Cajeros y supervisores</h2>
      <p className="mt-2 text-sm text-neutral-500">Deben tener cuenta en ENPASS. Después asignás un cajero a cada dispositivo desde la pestaña de caja.</p>
      <div className="mt-4 divide-y divide-[var(--border)]">{staffRows.map((member) => <form key={member.user_id} action={removeBoxOfficeStaff} className="flex items-center justify-between gap-3 py-3 text-sm"><input type="hidden" name="eventId" value={eventId}/><input type="hidden" name="userId" value={member.user_id}/><span><strong>{member.email}</strong> · {member.role === "supervisor" ? "Supervisor" : "Cajero"}</span><SubmitButton className="btn btn-ghost" pendingLabel="…">Quitar</SubmitButton></form>)}{staffRows.length === 0 && <p className="py-3 text-sm text-neutral-500">Todavía no agregaste a nadie.</p>}</div>
      <form action={addBoxOfficeStaff} className="mt-4 grid gap-3 sm:grid-cols-[1fr_180px_auto]"><input type="hidden" name="eventId" value={eventId}/><input className="field" type="email" name="email" placeholder="email@ejemplo.com" required/><select className="field" name="role" defaultValue="cashier"><option value="cashier">Cajero</option><option value="supervisor">Supervisor</option></select><SubmitButton className="btn btn-primary" pendingLabel="Agregando…">Agregar</SubmitButton></form>
    </section>

    <section className="card mt-7 p-5 sm:p-7">
      <p className="eyebrow">Taquilla hoy</p><h2 className="section-title mt-2">Resumen</h2>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">{[["Entradas", String(totals.tickets)], ["GMV productor", formatMoney(totals.gmv, currency)], ["Cargo ENPASS", formatMoney(totals.fee, currency)], ["Efectivo", formatMoney(totals.cash, currency)], ["Digital", formatMoney(totals.digital, currency)]].map(([label, value]) => <div key={label} className="rounded-xl border border-[var(--border)] p-3"><p className="text-[10px] font-bold uppercase text-neutral-600">{label}</p><p className="mt-2 font-black">{value}</p></div>)}</div>
      {(summary ?? []).length > 0 && <div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs uppercase text-neutral-600"><tr><th className="py-2">Cajero</th><th>Ventas</th><th>Entradas</th><th>Efectivo</th><th>Digital</th><th>Anuladas</th></tr></thead><tbody className="divide-y divide-[var(--border)]">{(summary ?? []).map((row) => <tr key={row.cashier_user_id ?? "none"}><td className="py-2 font-bold">{row.cashier_email ?? "Sin cajero"}</td><td>{row.sale_count}</td><td>{row.ticket_count}</td><td>{formatMoney(row.cash_amount, currency)}</td><td>{formatMoney(row.digital_amount, currency)}</td><td>{row.voided_count}</td></tr>)}</tbody></table></div>}
    </section>

    <section className="card mt-7 p-5 sm:p-7">
      <p className="eyebrow">Arqueo</p><h2 className="section-title mt-2">Cajas</h2>
      {(registers ?? []).length === 0 ? <p className="mt-3 text-sm text-neutral-500">Todavía no se abrió ninguna caja.</p> : <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs uppercase text-neutral-600"><tr><th className="py-2">Caja</th><th>Cajero</th><th>Apertura</th><th>Fondo</th><th>Esperado</th><th>Declarado</th><th>Diferencia</th><th>Ventas</th></tr></thead><tbody className="divide-y divide-[var(--border)]">{(registers ?? []).map((row) => <tr key={row.pos_session_id}><td className="py-2 font-bold">{row.location_name}<span className="ml-2 text-xs font-normal text-neutral-500">{row.status === "open" ? "abierta" : "cerrada"}</span></td><td>{row.cashier_email ?? row.operator_label ?? "—"}</td><td>{dateTime.format(new Date(row.opened_at))}</td><td>{formatMoney(row.opening_cash_amount, currency)}</td><td>{formatMoney(row.expected_cash_amount, currency)}</td><td>{row.counted_cash_amount === null ? "—" : formatMoney(row.counted_cash_amount, currency)}</td><td className={row.difference_amount ? "font-black text-red-400" : ""}>{row.difference_amount === null ? "—" : formatMoney(row.difference_amount, currency)}</td><td>{row.box_office_sales}</td></tr>)}</tbody></table></div>}
    </section>

    <section className="card mt-7 p-5 sm:p-7">
      <p className="eyebrow">Auditoría</p><h2 className="section-title mt-2">Ventas recientes</h2>
      {(sales ?? []).length === 0 ? <p className="mt-3 text-sm text-neutral-500">Todavía no hay ventas de taquilla.</p> : <div className="mt-4 divide-y divide-[var(--border)]">{(sales ?? []).map((sale) => <div key={sale.order_public_id} className="grid gap-3 py-3 text-sm sm:grid-cols-[1fr_auto] sm:items-center">
        <div><p className="font-bold">{formatMoney(sale.total_amount, currency)} · {sale.ticket_count} {sale.ticket_count === 1 ? "entrada" : "entradas"} · {boxOfficeMethodLabels[(sale.payment_method ?? "other") as BoxOfficePaymentMethod] ?? sale.payment_method}{sale.status === "refunded" && <span className="ml-2 text-red-400">ANULADA</span>}</p><p className="text-xs text-neutral-500">{dateTime.format(new Date(sale.created_at))} · {sale.cashier_email ?? "Sin cajero"} · cargo {formatMoney(sale.service_fee_amount, currency)} · #{sale.order_public_id.slice(0, 6).toUpperCase()}</p></div>
        {sale.status === "paid" && sale.register_open && <form action={voidBoxOfficeSale} className="flex gap-2"><input type="hidden" name="eventId" value={eventId}/><input type="hidden" name="orderPublicId" value={sale.order_public_id}/><input className="field h-10" name="reason" placeholder="Motivo" required minLength={3}/><SubmitButton className="btn btn-ghost h-10 text-red-300" pendingLabel="…">Anular</SubmitButton></form>}
      </div>)}</div>}
    </section>
  </>;
}
