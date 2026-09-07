import { NextResponse } from "next/server";
import { addCurrentPosCashMovement } from "@/modules/pos/application/pos-api";
import { posMovementSchema } from "@/modules/pos/domain/pos";

export async function POST(request: Request) {
  const parsed = posMovementSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Indicá un monto y una razón." }, { status: 400 });
  try { return NextResponse.json({ id: await addCurrentPosCashMovement(parsed.data.type, parsed.data.amount, parsed.data.reason) }); }
  catch { return NextResponse.json({ error: "No pudimos registrar el movimiento." }, { status: 409 }); }
}
