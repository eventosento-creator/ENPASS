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
    if (message.startsWith("DOOR_LINK_NOT_OPEN:")) {
      const [price, state, start] = message.slice("DOOR_LINK_NOT_OPEN:".length).split("|");
      const money = `$${(Number(price) / 100).toLocaleString("es-AR")}`;
      const when = start ? new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(start)) : "";
      const reason = state === "upcoming" ? `todavía no está habilitada: se habilita el ${when} (hora de Argentina). Cambiale el horario en Entradas > Entradas por link.`
        : state === "ended" ? "ya terminó su horario de venta. Extendé el horario en Entradas > Entradas por link." : "se agotó (no quedan entradas).";
      return NextResponse.json({ error: `La "Entrada por link" de ${money} existe pero ${reason}` }, { status: 409 });
    }
    return NextResponse.json({ error: "No pudimos generar el QR de compra." }, { status: 500 });
  }
}
