import { NextResponse } from "next/server";
import { cancelBoxOfficeSale } from "@/modules/pos/application/pos-api";
import { boxOfficeOrderSchema } from "@/modules/pos/domain/box-office";

export async function POST(request: Request) {
  const parsed = boxOfficeOrderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Venta inválida." }, { status: 400 });
  try { await cancelBoxOfficeSale(parsed.data.orderPublicId); return NextResponse.json({ cancelled: true }); }
  catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("PAYMENT_IN_PROGRESS")) return NextResponse.json({ error: "Hay un pago en revisión: esperá su resultado antes de cancelar." }, { status: 409 });
    return NextResponse.json({ error: "No pudimos cancelar la operación." }, { status: 500 });
  }
}
