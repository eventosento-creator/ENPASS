import "server-only";

import { createAdminClient } from "@/shared/database/admin";
import { hashOpaqueToken } from "@/modules/ticketing/domain/credentials";
import { createPosSessionCredential, getPosSessionHash } from "../infrastructure/pos-session";
import type { PosCatalogItem, PosDeviceSessionView, PosPaymentMethod } from "../domain/pos";

export function fingerprintPosRequest(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const userAgent = request.headers.get("user-agent")?.slice(0, 240) ?? "unknown";
  return hashOpaqueToken(`${forwardedFor}|${userAgent}`);
}

export async function activatePos(pin: string, fingerprintHash: string) {
  const credential = createPosSessionCredential();
  const { data, error } = await createAdminClient().rpc("activate_pos_device", {
    target_pin: pin, target_session_hash: credential.hash, target_fingerprint_hash: fingerprintHash,
  });
  if (error || !data?.[0]) throw new Error("POS_ACTIVATION_FAILED");
  const activation = data[0];
  if (activation.activation_status !== "ok" || !activation.expires_at || !activation.device_session_id) {
    return { activation, rawSession: null, session: null };
  }
  const session: PosDeviceSessionView = {
    device_session_id: activation.device_session_id,
    device_id: activation.device_id!, event_id: activation.event_id!, event_name: activation.event_name!,
    sales_location_id: activation.sales_location_id!, sales_location_name: activation.sales_location_name!,
    device_name: activation.device_name!, event_timezone: activation.event_timezone!, expires_at: activation.expires_at,
    pos_enabled: true, event_status: "published", cash_session_id: null, cash_session_status: null,
    operator_label: null, opening_cash_amount: null, opened_at: null,
  };
  return { activation, rawSession: credential.raw, session };
}

export async function getCurrentPosSession(): Promise<PosDeviceSessionView | null> {
  const sessionHash = await getPosSessionHash();
  if (!sessionHash) return null;
  const { data, error } = await createAdminClient().rpc("get_pos_device_session", { target_session_hash: sessionHash });
  if (error || !data?.[0]) return null;
  return data[0] as PosDeviceSessionView;
}

export async function getCurrentPosCatalog(): Promise<PosCatalogItem[]> {
  const sessionHash = await getPosSessionHash();
  if (!sessionHash) return [];
  const { data, error } = await createAdminClient().rpc("get_pos_catalog", { target_session_hash: sessionHash });
  if (error) throw new Error("CATALOG_UNAVAILABLE");
  return (data ?? []) as PosCatalogItem[];
}

export async function openCurrentPosSession(openingCashAmount: number, operatorLabel: string) {
  const sessionHash = await getPosSessionHash();
  if (!sessionHash) throw new Error("DEVICE_NOT_AUTHORIZED");
  const { data, error } = await createAdminClient().rpc("open_pos_session", {
    target_session_hash: sessionHash,
    target_opening_cash_amount: openingCashAmount,
    target_operator_label: operatorLabel,
  });
  if (error || !data) throw new Error(error?.message.includes("SESSION_ALREADY_OPEN") ? "SESSION_ALREADY_OPEN" : "OPEN_FAILED");
  return data;
}

export async function finalizeCurrentPosSale(input: {
  idempotencyKey: string;
  items: Array<{ event_product_id: string; quantity: number }>;
  paymentMethod: PosPaymentMethod;
  cashReceivedAmount?: number | null;
  externalReference?: string | null;
}) {
  const sessionHash = await getPosSessionHash();
  if (!sessionHash) throw new Error("DEVICE_NOT_AUTHORIZED");
  const { data, error } = await createAdminClient().rpc("finalize_pos_sale", {
    target_session_hash: sessionHash, target_idempotency_key: input.idempotencyKey,
    target_items: input.items, target_payment_method: input.paymentMethod,
    target_cash_received_amount: input.cashReceivedAmount ?? null,
    target_external_reference: input.externalReference ?? null,
  });
  if (error || !data?.[0]) throw new Error(error?.message ?? "SALE_FAILED");
  return data[0];
}

export async function addCurrentPosCashMovement(type: "cash_in" | "cash_out", amount: number, reason: string) {
  const sessionHash = await getPosSessionHash();
  if (!sessionHash) throw new Error("DEVICE_NOT_AUTHORIZED");
  const { data, error } = await createAdminClient().rpc("add_pos_cash_movement", {
    target_session_hash: sessionHash, target_type: type, target_amount: amount, target_reason: reason,
  });
  if (error || !data) throw new Error("MOVEMENT_FAILED");
  return data;
}

export async function getCurrentPosCashSummary() {
  const sessionHash = await getPosSessionHash();
  if (!sessionHash) return null;
  const { data, error } = await createAdminClient().rpc("get_pos_cash_summary", { target_session_hash: sessionHash });
  if (error || !data?.[0]) return null;
  return data[0];
}

export async function closeCurrentPosSession(countedCashAmount: number) {
  const sessionHash = await getPosSessionHash();
  if (!sessionHash) throw new Error("DEVICE_NOT_AUTHORIZED");
  const { data, error } = await createAdminClient().rpc("close_pos_session", {
    target_session_hash: sessionHash, target_counted_cash_amount: countedCashAmount,
  });
  if (error || !data?.[0]) throw new Error("CLOSE_FAILED");
  return data[0];
}

export async function revokeCurrentPosDeviceSession() {
  const sessionHash = await getPosSessionHash();
  if (!sessionHash) return;
  await createAdminClient().rpc("revoke_current_pos_device_session", { target_session_hash: sessionHash });
}
