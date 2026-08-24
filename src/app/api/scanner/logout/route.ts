import { NextResponse } from "next/server";
import { createAdminClient } from "@/shared/database/admin";
import { clearScannerSessionCookie, getScannerSessionHash } from "@/modules/access/infrastructure/scanner-session";

export async function POST() {
  const sessionHash = await getScannerSessionHash();
  if (sessionHash) await createAdminClient().rpc("revoke_current_scanner_session", { target_session_hash: sessionHash });
  await clearScannerSessionCookie();
  return NextResponse.json({ ok: true });
}
