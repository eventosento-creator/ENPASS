import { NextRequest, NextResponse } from "next/server";
import { getBoxOfficeOrderStatus } from "@/modules/pos/application/pos-api";
import { boxOfficeOrderSchema } from "@/modules/pos/domain/box-office";

export async function GET(request: NextRequest) {
  const parsed = boxOfficeOrderSchema.safeParse({ orderPublicId: request.nextUrl.searchParams.get("order") });
  if (!parsed.success) return NextResponse.json({ error: "Venta inválida." }, { status: 400 });
  try { return NextResponse.json(await getBoxOfficeOrderStatus(parsed.data.orderPublicId), { headers: { "cache-control": "no-store" } }); }
  catch { return NextResponse.json({ error: "No pudimos consultar el estado." }, { status: 500 }); }
}
