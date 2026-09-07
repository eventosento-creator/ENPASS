import { NextResponse } from "next/server";
import { openCurrentPosSession } from "@/modules/pos/application/pos-api";
import { openPosSessionSchema } from "@/modules/pos/domain/pos";

export async function POST(request: Request) {
  const parsed = openPosSessionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Revisá el fondo inicial y el nombre del cajero." }, { status: 400 });
  try { const id = await openCurrentPosSession(parsed.data.openingCashAmount, parsed.data.operatorLabel); return NextResponse.json({ posSessionId: id }); }
  catch { return NextResponse.json({ error: "No pudimos abrir la caja." }, { status: 409 }); }
}
