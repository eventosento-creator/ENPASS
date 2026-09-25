import { NextResponse } from "next/server";
import { verifyBoxOfficePayment } from "@/modules/pos/application/pos-api";
import { boxOfficeOrderSchema } from "@/modules/pos/domain/box-office";

export async function POST(request: Request) {
  const parsed = boxOfficeOrderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Venta inválida." }, { status: 400 });
  try { return NextResponse.json(await verifyBoxOfficePayment(parsed.data.orderPublicId), { headers: { "cache-control": "no-store" } }); }
  catch { return NextResponse.json({ error: "No pudimos verificar el pago con Mercado Pago. Reintentá en unos segundos." }, { status: 502 }); }
}
