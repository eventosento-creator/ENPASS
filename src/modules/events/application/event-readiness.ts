import "server-only";

import { createClient } from "@/shared/database/server";
import { evaluateEventReadiness, type ReadinessResult } from "../domain/event-readiness";
import type { EventCapabilities } from "../domain/event-profile";

/** Junta lo que hace falta del evento y arma el chequeo "¿estás listo para la noche?". Solo para quien administra el evento. */
export async function getEventReadiness(event: { id: string; organization_id: string; status: string; pos_enabled: boolean }, capabilities: EventCapabilities): Promise<ReadinessResult> {
  const supabase = await createClient();
  const [{ data: ticketTypes }, { data: gates }, { data: rules }, { data: scanners }, { data: paymentRows }, { data: organization }, { data: boxSettings }, { data: registers }] = await Promise.all([
    supabase.from("ticket_types").select("id, name, active, price_amount").eq("event_id", event.id),
    supabase.from("access_gates").select("id, active").eq("event_id", event.id),
    supabase.from("access_gate_ticket_types").select("access_gate_id, ticket_type_id").eq("event_id", event.id),
    supabase.from("scanner_device_authorizations").select("id, activated_at, revoked_at, session_expires_at").eq("event_id", event.id),
    supabase.rpc("get_payment_account_status", { target_organization: event.organization_id }),
    supabase.from("organizations").select("ticket_transfer_enabled").eq("id", event.organization_id).maybeSingle(),
    supabase.from("event_box_office_settings").select("enabled").eq("event_id", event.id).maybeSingle(),
    supabase.from("pos_device_authorizations").select("id, status, cashier_user_id").eq("event_id", event.id),
  ]);
  const now = Date.now();
  const activatedScanners = (scanners ?? []).filter((device) => device.activated_at && !device.revoked_at && new Date(device.session_expires_at).getTime() > now).length;
  const liveRegisters = (registers ?? []).filter((register) => register.status !== "revoked");
  return evaluateEventReadiness({
    eventId: event.id,
    status: event.status,
    capabilities: { tickets: capabilities.tickets, access: capabilities.access, pos: capabilities.pos },
    ticketTypes: ticketTypes ?? [],
    gates: gates ?? [],
    rules: rules ?? [],
    activatedScanners,
    payment: { mercadoPagoConnected: paymentRows?.[0]?.status === "connected", transferEnabled: organization?.ticket_transfer_enabled === true },
    boxOffice: { enabled: !!boxSettings?.enabled && event.pos_enabled, registers: liveRegisters.length, registersWithCashier: liveRegisters.filter((register) => register.cashier_user_id).length },
  });
}
