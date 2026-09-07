import { NextResponse } from "next/server";
import { getCurrentPosCatalog, getCurrentPosCashSummary, getCurrentPosSession } from "@/modules/pos/application/pos-api";

export async function GET() {
  const session = await getCurrentPosSession();
  if (!session) return NextResponse.json({ error: "Dispositivo no autorizado." }, { status: 401 });
  const [catalog, cashSummary] = await Promise.all([getCurrentPosCatalog(), getCurrentPosCashSummary()]);
  return NextResponse.json({ session, catalog, cashSummary });
}
