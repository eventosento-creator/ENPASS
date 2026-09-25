"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/shared/database/server";
import { createAdminClient } from "@/shared/database/admin";
import { getPaymentAccountAccessToken } from "@/modules/payments/application/account-credentials";
import { MercadoPagoProvider } from "@/modules/payments/infrastructure/mercado-pago-provider";

const eventId = z.uuid();

function back(id: string, kind: "notice" | "error", message: string): never {
  revalidatePath(`/app/events/${id}/box-office`);
  redirect(`/app/events/${id}/box-office?${kind}=${encodeURIComponent(message)}` as never);
}

export async function enableBoxOfficeModule(formData: FormData) {
  const parsed = z.object({ eventId }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("profile, tickets_enabled, promoters_enabled, tables_enabled, access_enabled, inventory_enabled, seatmap_enabled").eq("id", parsed.data.eventId).single();
  if (!event) back(parsed.data.eventId, "error", "No encontramos el evento.");
  const { error } = await supabase.rpc("update_event_configuration", {
    target_event: parsed.data.eventId, target_profile: event.profile, target_tickets_enabled: true,
    target_promoters_enabled: event.promoters_enabled, target_tables_enabled: event.tables_enabled,
    target_access_enabled: event.access_enabled, target_pos_enabled: true,
    target_inventory_enabled: event.inventory_enabled, target_seatmap_enabled: event.seatmap_enabled,
  });
  if (error) back(parsed.data.eventId, "error", "No pudimos activar la caja. Probá desde Editar evento > Funciones del evento.");
  revalidatePath(`/app/events/${parsed.data.eventId}`);
  back(parsed.data.eventId, "notice", "Caja activada. Ahora configurá la taquilla.");
}

const settingsSchema = z.object({ eventId, qrExpiry: z.coerce.number().int().min(3).max(30).default(10) });

export async function saveBoxOfficeSettings(formData: FormData) {
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const on = (name: string) => formData.get(name) === "on";
  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_box_office_settings", {
    target_event: parsed.data.eventId, target_enabled: on("enabled"), target_cash: on("cash"), target_qr: on("qr"),
    target_debit: on("debit"), target_credit: on("credit"), target_transfer: on("transfer"), target_other: on("other"),
    target_allow_after_start: true, target_closes_at: null,
    target_mp_qr: on("mpQr"), target_qr_expiry: parsed.data.qrExpiry,
  });
  if (error) back(parsed.data.eventId, "error", "No pudimos guardar la configuración.");
  back(parsed.data.eventId, "notice", "Configuración de taquilla guardada.");
}

const priceSchema = z.object({
  eventId, ticketTypeId: z.uuid(),
  pricePesos: z.preprocess((value) => value === "" ? undefined : value, z.coerce.number().min(0).max(90_000_000_000).optional()),
});

export async function saveBoxOfficePrice(formData: FormData) {
  const parsed = priceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const enabled = formData.get("enabled") === "on";
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_box_office_ticket_price", {
    target_ticket_type: parsed.data.ticketTypeId,
    target_price_amount: parsed.data.pricePesos === undefined ? null : Math.round(parsed.data.pricePesos * 100),
    target_enabled: enabled,
  });
  if (error) back(parsed.data.eventId, "error", "No pudimos guardar el precio de puerta.");
  back(parsed.data.eventId, "notice", "Precio de puerta guardado.");
}

const staffSchema = z.object({ eventId, email: z.email(), role: z.enum(["cashier", "supervisor"]) });

export async function addBoxOfficeStaff(formData: FormData) {
  const parsed = staffSchema.safeParse(Object.fromEntries(formData));
  const id = String(formData.get("eventId") ?? "");
  if (!parsed.success) { if (eventId.safeParse(id).success) back(id, "error", "Revisá el email y el rol."); return; }
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_box_office_staff", { target_event: parsed.data.eventId, target_email: parsed.data.email, target_role: parsed.data.role });
  if (error?.message.includes("USER_NOT_FOUND")) back(parsed.data.eventId, "error", "Esa persona todavía no tiene cuenta en ENPASS. Pedile que se registre primero con ese email.");
  if (error) back(parsed.data.eventId, "error", "No pudimos agregar a la persona.");
  back(parsed.data.eventId, "notice", "Persona agregada a la taquilla.");
}

export async function removeBoxOfficeStaff(formData: FormData) {
  const parsed = z.object({ eventId, userId: z.uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_box_office_staff", { target_event: parsed.data.eventId, target_user: parsed.data.userId });
  if (error) back(parsed.data.eventId, "error", "No pudimos quitar a la persona.");
  back(parsed.data.eventId, "notice", "Persona quitada de la taquilla.");
}

export async function voidBoxOfficeSale(formData: FormData) {
  const parsed = z.object({ eventId, orderPublicId: z.string().regex(/^[0-9a-f]{32}$/), reason: z.string().trim().min(3).max(240) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) { const id = String(formData.get("eventId") ?? ""); if (eventId.safeParse(id).success) back(id, "error", "Escribí el motivo de la anulación."); return; }
  const supabase = await createClient();
  const { data: order } = await createAdminClient().from("orders").select("id, event_id, organization_id").eq("public_id", parsed.data.orderPublicId).eq("channel", "box_office").maybeSingle();
  if (!order) back(parsed.data.eventId, "error", "No encontramos la venta.");
  const { data: allowed } = await supabase.rpc("can_supervise_box_office", { target_event: order.event_id });
  if (!allowed) back(parsed.data.eventId, "error", "No tenés permiso para anular ventas de esta taquilla.");
  const { data: payment } = await createAdminClient().from("payments").select("id, public_id, provider, provider_payment_id, payment_account_id")
    .eq("order_id", order.id).in("status", ["approved", "partially_refunded"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (payment?.provider === "mercado_pago") {
    // Money paid through Mercado Pago is returned by Mercado Pago; the webhook then voids the tickets and reverses the ledger.
    if (!payment.provider_payment_id || !payment.payment_account_id) back(parsed.data.eventId, "error", "El pago no tiene un identificador de Mercado Pago para reembolsar.");
    try {
      const accessToken = await getPaymentAccountAccessToken(payment.payment_account_id);
      await new MercadoPagoProvider().refundPayment(payment.provider_payment_id, `enpass-void-${payment.public_id}`, { accessToken });
    } catch {
      back(parsed.data.eventId, "error", "Mercado Pago no pudo procesar el reembolso. Reintentá en unos minutos.");
    }
    await createAdminClient().from("audit_logs").insert({ organization_id: order.organization_id, actor_user_id: (await supabase.auth.getUser()).data.user?.id ?? null, action: "box_office.sale.refund_requested", entity_type: "order", entity_id: order.id, after_data: { reason: parsed.data.reason } });
    back(parsed.data.eventId, "notice", "Reembolso solicitado a Mercado Pago. Las entradas se anulan apenas Mercado Pago lo confirme.");
  }
  const { error } = await supabase.rpc("void_box_office_sale", { target_order_public_id: parsed.data.orderPublicId, target_reason: parsed.data.reason });
  if (error?.message.includes("REGISTER_CLOSED")) back(parsed.data.eventId, "error", "Esa caja ya está cerrada: la venta no se puede anular sin reabrir el arqueo.");
  if (error) back(parsed.data.eventId, "error", "No pudimos anular la venta.");
  back(parsed.data.eventId, "notice", "Venta anulada: entradas invalidadas y movimientos revertidos.");
}
