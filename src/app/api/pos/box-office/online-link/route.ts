import { NextResponse } from "next/server";
import { getBoxOfficeOnlineLink } from "@/modules/pos/application/pos-api";
import { boxOfficeQuoteSchema } from "@/modules/pos/domain/box-office";

export async function POST(request: Request) {
  const parsed = boxOfficeQuoteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Cantidad inválida." }, { status: 400 });
  try { return NextResponse.json(await getBoxOfficeOnlineLink(parsed.data.ticketTypeId, parsed.data.quantity)); }
  catch { return NextResponse.json({ error: "No pudimos generar el QR de compra." }, { status: 500 }); }
}
