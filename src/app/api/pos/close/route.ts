import { NextResponse } from "next/server";
import { closeCurrentPosSession } from "@/modules/pos/application/pos-api";
import { closePosSessionSchema } from "@/modules/pos/domain/pos";

export async function POST(request: Request) {
  const parsed = closePosSessionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ingresá el efectivo contado." }, { status: 400 });
  try { return NextResponse.json({ close: await closeCurrentPosSession(parsed.data.countedCashAmount) }); }
  catch { return NextResponse.json({ error: "No pudimos cerrar la caja." }, { status: 409 }); }
}
