import { NextResponse } from "next/server";
import { quoteCurrentBoxOfficeSale } from "@/modules/pos/application/pos-api";
import { boxOfficeQuoteSchema } from "@/modules/pos/domain/box-office";

export async function POST(request: Request) {
  const parsed = boxOfficeQuoteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Cantidad inválida." }, { status: 400 });
  try { return NextResponse.json({ quote: await quoteCurrentBoxOfficeSale(parsed.data.ticketTypeId, parsed.data.quantity) }); }
  catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("TICKET_NOT_AVAILABLE_AT_BOX_OFFICE")) return NextResponse.json({ error: "Esa entrada no se vende en taquilla." }, { status: 409 });
    return NextResponse.json({ error: "No pudimos calcular el precio." }, { status: 500 });
  }
}
