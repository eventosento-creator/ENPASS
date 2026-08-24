import "server-only";

import { createAdminClient } from "@/shared/database/admin";
import { hashOpaqueToken } from "@/modules/ticketing/domain/credentials";
import { createScannerSessionCredential, getScannerSessionHash } from "../infrastructure/scanner-session";
import type { CheckInResponse, ScannerSessionView } from "../domain/scanner";

export function fingerprintScannerRequest(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const userAgent = request.headers.get("user-agent")?.slice(0, 240) ?? "unknown";
  return hashOpaqueToken(`${forwardedFor}|${userAgent}`);
}

export async function activateScanner(pin: string, fingerprintHash: string) {
  const credential = createScannerSessionCredential();
  const { data, error } = await createAdminClient().rpc("activate_scanner_device", {
    target_pin: pin,
    target_session_hash: credential.hash,
    target_fingerprint_hash: fingerprintHash,
  });
  if (error || !data?.[0]) throw new Error("SCANNER_ACTIVATION_FAILED");
  const activation = data[0];
  if (activation.activation_status !== "ok" || !activation.expires_at || !activation.scanner_session_id) {
    return { activation, rawSession: null, session: null };
  }
  const session: ScannerSessionView = {
    scanner_session_id: activation.scanner_session_id,
    event_id: activation.event_id!,
    event_name: activation.event_name!,
    gate_id: activation.gate_id!,
    gate_name: activation.gate_name!,
    permission: activation.permission!,
    event_timezone: activation.event_timezone!,
    expires_at: activation.expires_at,
  };
  return { activation, rawSession: credential.raw, session };
}

export async function checkInPayload(payload: string, idempotencyKey: string): Promise<CheckInResponse> {
  const sessionHash = await getScannerSessionHash() ?? hashOpaqueToken(`missing:${idempotencyKey}`);
  const { data, error } = await createAdminClient().rpc("check_in_ticket", {
    target_session_hash: sessionHash,
    target_qr_hash: hashOpaqueToken(payload),
    target_idempotency_key: idempotencyKey,
  });
  if (error || !data?.[0]) throw new Error("CHECK_IN_FAILED");
  return data[0] as CheckInResponse;
}

export async function overrideCheckIn(checkinId: string, reason: "wrong_gate" | "outside_window" | "supervisor_exception", idempotencyKey: string) {
  const sessionHash = await getScannerSessionHash();
  if (!sessionHash) throw new Error("SUPERVISOR_REQUIRED");
  const { data, error } = await createAdminClient().rpc("supervisor_override_checkin", {
    target_session_hash: sessionHash,
    target_checkin: checkinId,
    target_reason: reason,
    target_idempotency_key: idempotencyKey,
  });
  if (error || !data) throw new Error(error?.message.includes("SUPERVISOR_REQUIRED") ? "SUPERVISOR_REQUIRED" : "OVERRIDE_FAILED");
  return data as unknown as CheckInResponse;
}

export async function previewManualTicket(shortCode: string) {
  const sessionHash = await getScannerSessionHash();
  if (!sessionHash) throw new Error("SUPERVISOR_REQUIRED");
  const { data, error } = await createAdminClient().rpc("get_supervisor_ticket_preview", {
    target_session_hash: sessionHash,
    target_short_code: shortCode,
  });
  if (error?.message.includes("RATE_LIMITED")) throw new Error("RATE_LIMITED");
  if (error || !data) throw new Error("SUPERVISOR_REQUIRED");
  return data;
}

export async function manualCheckIn(shortCode: string, idempotencyKey: string) {
  const sessionHash = await getScannerSessionHash();
  if (!sessionHash) throw new Error("SUPERVISOR_REQUIRED");
  const { data, error } = await createAdminClient().rpc("supervisor_manual_checkin", {
    target_session_hash: sessionHash,
    target_short_code: shortCode,
    target_idempotency_key: idempotencyKey,
  });
  if (error?.message.includes("RATE_LIMITED")) throw new Error("RATE_LIMITED");
  if (error || !data) throw new Error("MANUAL_CHECK_IN_FAILED");
  return data as unknown as CheckInResponse;
}
