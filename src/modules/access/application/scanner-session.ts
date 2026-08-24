import "server-only";

import { createAdminClient } from "@/shared/database/admin";
import { getScannerSessionHash } from "../infrastructure/scanner-session";
import type { ScannerSessionView } from "../domain/scanner";

export async function getCurrentScannerSession(): Promise<ScannerSessionView | null> {
  const sessionHash = await getScannerSessionHash();
  if (!sessionHash) return null;
  const { data, error } = await createAdminClient().rpc("get_scanner_session", { target_session_hash: sessionHash });
  if (error || !data?.[0]) return null;
  return data[0] as ScannerSessionView;
}
