import { NextResponse } from "next/server";
import { getCurrentScannerSession } from "@/modules/access/application/scanner-session";
import { clearScannerSessionCookie } from "@/modules/access/infrastructure/scanner-session";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getCurrentScannerSession();
  if (!session) {
    await clearScannerSessionCookie();
    return NextResponse.json({ session: null }, { status: 401 });
  }
  return NextResponse.json({ session });
}
