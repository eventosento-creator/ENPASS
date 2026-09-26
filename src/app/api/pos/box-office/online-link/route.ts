import { NextResponse } from "next/server";
import { getBoxOfficeOnlineLink } from "@/modules/pos/application/pos-api";
import { boxOfficeQuoteSchema } from "@/modules/pos/domain/box-office";

export async function POST(request: Request) {
  const parsed = boxOfficeQuoteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Cantidad inválida." }, { status: 400 });
  try { return NextResponse.json(await getBoxOfficeOnlineLink(parsed.data.ticketTypeId, parsed.data.quantity)); }
  catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("NO_DOOR_LINK_TICKET:")) {
      const price = Number(message.split(":")[1]) / 100;
      return NextResponse.json({ error: `Para cobrar online al precio de puerta ($${price.toLocaleString("es-AR")}) hace falta una "Entrada por link" de ese precio, habilitada. Creala en Entradas > Entradas por link.` }, { status: 409 });
    }
    return NextResponse.json({ error: "No pudimos generar el QR de compra." }, { status: 500 });
  }
}
