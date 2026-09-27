import { NextResponse } from "next/server";
import { getCurrentBoxOfficeState, getCurrentPosCatalog, getCurrentPosCashSummary, getPosSessionState } from "@/modules/pos/application/pos-api";

export async function GET() {
  const state = await getPosSessionState();
  if (state.status === "unavailable") return NextResponse.json({ error: "Sin conexión con el servidor." }, { status: 503 });
  if (state.status === "none") return NextResponse.json({ error: "Dispositivo no autorizado." }, { status: 401 });
  const [catalog, cashSummary, boxOffice] = await Promise.all([getCurrentPosCatalog(), getCurrentPosCashSummary(), getCurrentBoxOfficeState()]);
  return NextResponse.json({ session: state.session, catalog, cashSummary, boxOffice });
}
