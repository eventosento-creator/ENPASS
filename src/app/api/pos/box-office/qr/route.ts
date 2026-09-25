import { NextResponse } from "next/server";
import { startBoxOfficeQr } from "@/modules/pos/application/pos-api";
import { boxOfficeOrderSchema } from "@/modules/pos/domain/box-office";

export async function POST(request: Request) {
  const parsed = boxOfficeOrderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Venta inválida." }, { status: 400 });
  try { return NextResponse.json(await startBoxOfficeQr(parsed.data.orderPublicId)); }
  catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("QR_NOT_ENABLED")) return NextResponse.json({ error: "El cobro con QR no está habilitado en este evento." }, { status: 409 });
    if (message.includes("PAYMENT_ACCOUNT_REQUIRED") || message.includes("PAYMENT_ACCOUNT_RECONNECT_REQUIRED")) return NextResponse.json({ error: "El productor no tiene Mercado Pago conectado." }, { status: 409 });
    if (message.includes("ORDER_NOT_PAYABLE") || message.includes("HOLD_EXPIRED")) return NextResponse.json({ error: "La reserva venció. Empezá una nueva venta.", expired: true }, { status: 409 });
    return NextResponse.json({ error: "No pudimos generar el QR de pago. Reintentá o cobrá por otro medio." }, { status: 500 });
  }
}
