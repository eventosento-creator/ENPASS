import { NextResponse } from "next/server";
import { confirmCurrentBoxOfficeSale } from "@/modules/pos/application/pos-api";
import { boxOfficeConfirmSchema } from "@/modules/pos/domain/box-office";

export async function POST(request: Request) {
  const parsed = boxOfficeConfirmSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "El cobro no es válido." }, { status: 400 });
  try { return NextResponse.json(await confirmCurrentBoxOfficeSale(parsed.data)); }
  catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("INSUFFICIENT_CASH")) return NextResponse.json({ error: "El efectivo recibido no alcanza." }, { status: 400 });
    if (message.includes("PAYMENT_METHOD_NOT_ALLOWED")) return NextResponse.json({ error: "Ese medio de pago no está habilitado." }, { status: 409 });
    if (message.includes("ORDER_NOT_PAYABLE")) return NextResponse.json({ error: "La reserva venció. Empezá una nueva venta.", expired: true }, { status: 409 });
    if (message.includes("CASH_SESSION_REQUIRED")) return NextResponse.json({ error: "La caja ya no está abierta." }, { status: 409 });
    return NextResponse.json({ error: "No pudimos confirmar el cobro. Volvé a intentar." }, { status: 500 });
  }
}
