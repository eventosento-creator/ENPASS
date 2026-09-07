import { NextResponse } from "next/server";
import { revokeCurrentPosDeviceSession } from "@/modules/pos/application/pos-api";
import { clearPosSessionCookie } from "@/modules/pos/infrastructure/pos-session";

export async function POST() {
  await revokeCurrentPosDeviceSession().catch(() => undefined);
  await clearPosSessionCookie();
  return NextResponse.json({ ok: true });
}
