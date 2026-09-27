import { NextResponse } from "next/server";
import { getScannerSessionState } from "@/modules/access/application/scanner-session";
import { clearScannerSessionCookie } from "@/modules/access/infrastructure/scanner-session";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = await getScannerSessionState();
  if (state.status === "unavailable") return NextResponse.json({ session: null, unavailable: true }, { status: 503 });
  if (state.status === "none") {
    await clearScannerSessionCookie();
    return NextResponse.json({ session: null }, { status: 401 });
  }
  return NextResponse.json({ session: state.session });
}
