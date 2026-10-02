import "server-only";

import { createAdminClient } from "@/shared/database/admin";
import { fingerprintScannerRequest } from "@/modules/access/application/scanner-api";
import { createClubDoorCredential, getClubDoorSessionHash } from "../infrastructure/club-door-session";
import { verifyMemberQrPayload } from "../infrastructure/member-qr";
import type { ClubDoorResponse, ClubDoorSessionView } from "../domain/club-door";

export { fingerprintScannerRequest };

export async function activateClubDoor(pin: string, fingerprintHash: string) {
  const credential = createClubDoorCredential();
  const { data, error } = await createAdminClient().rpc("activate_club_door_device", {
    target_pin: pin, target_session_hash: credential.hash, target_fingerprint_hash: fingerprintHash,
  });
  const activation = data?.[0];
  if (error || !activation) throw new Error("CLUB_DOOR_ACTIVATION_FAILED");
  if (activation.activation_status !== "ok" || !activation.expires_at || !activation.door_session_id) return { activation, rawSession: null, session: null };
  const session: ClubDoorSessionView = {
    door_session_id: activation.door_session_id, organization_id: activation.organization_id!, organization_name: activation.organization_name!,
    device_name: activation.device_name!, expires_at: activation.expires_at,
  };
  return { activation, rawSession: credential.raw, session };
}

export type ClubDoorSessionState = { status: "active"; session: ClubDoorSessionView } | { status: "none" } | { status: "unavailable" };

// Igual que el scanner de eventos: "none" cierra la sesión del dispositivo, "unavailable" (error de red/DB) nunca.
export async function getClubDoorSessionState(): Promise<ClubDoorSessionState> {
  const hash = await getClubDoorSessionHash();
  if (!hash) return { status: "none" };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await createAdminClient().rpc("get_club_door_session", { target_session_hash: hash });
    if (!error) return data?.[0] ? { status: "active", session: data[0] as ClubDoorSessionView } : { status: "none" };
  }
  return { status: "unavailable" };
}

export async function checkInMemberPayload(payload: string): Promise<ClubDoorResponse> {
  const empty = { member_name: null, member_number: null, category_name: null, overdue_amount: null };
  const verification = verifyMemberQrPayload(payload);
  if (!verification.ok) return { result: verification.reason, ...empty };
  const hash = await getClubDoorSessionHash();
  if (!hash) return { result: "device_not_authorized", ...empty };
  const { data, error } = await createAdminClient().rpc("check_in_member", { target_session_hash: hash, target_membership: verification.membershipId });
  if (error || !data?.[0]) throw new Error("CLUB_DOOR_CHECK_IN_FAILED");
  return data[0] as ClubDoorResponse;
}
