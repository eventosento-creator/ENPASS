import { NextResponse } from "next/server";
import { finalizeCurrentPosSale } from "@/modules/pos/application/pos-api";
import { posSaleSchema } from "@/modules/pos/domain/pos";

export async function POST(request: Request) {
  const parsed = posSaleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "La venta no es válida." }, { status: 400 });
  try { return NextResponse.json({ sale: await finalizeCurrentPosSale(parsed.data) }); }
  catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("INSUFFICIENT_CASH")) return NextResponse.json({ error: "El efectivo recibido no alcanza." }, { status: 400 });
    if (message.includes("PRODUCT_UNAVAILABLE")) return NextResponse.json({ error: "Uno de los productos ya no está disponible." }, { status: 409 });
    if (message.includes("CASH_SESSION_REQUIRED") || message.includes("POS_NOT_OPERATIONAL")) return NextResponse.json({ error: "La caja ya no está abierta para vender." }, { status: 409 });
    return NextResponse.json({ error: "No pudimos registrar la venta. Volvé a intentar." }, { status: 500 });
  }
}
