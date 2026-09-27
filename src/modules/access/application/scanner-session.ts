import "server-only";

import { createAdminClient } from "@/shared/database/admin";
import { getScannerSessionHash } from "../infrastructure/scanner-session";
import type { ScannerSessionView } from "../domain/scanner";

export type ScannerSessionState = { status: "active"; session: ScannerSessionView } | { status: "none" } | { status: "unavailable" };

// "none" means the database answered and there is no valid session; "unavailable" means we could not ask (timeout or
// error). Only "none" may end the device's session: the PIN is single-use, so a slow database must never log staff out.
export async function getScannerSessionState(): Promise<ScannerSessionState> {
  const sessionHash = await getScannerSessionHash();
  if (!sessionHash) return { status: "none" };
  const admin = createAdminClient();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await admin.rpc("get_scanner_session", { target_session_hash: sessionHash });
    if (!error) return data?.[0] ? { status: "active", session: data[0] as ScannerSessionView } : { status: "none" };
  }
  return { status: "unavailable" };
}

export async function getCurrentScannerSession(): Promise<ScannerSessionView | null> {
  const sessionHash = await getScannerSessionHash();
  if (!sessionHash) return null;
  const { data, error } = await createAdminClient().rpc("get_scanner_session", { target_session_hash: sessionHash });
  if (error || !data?.[0]) return null;
  return data[0] as ScannerSessionView;
}
