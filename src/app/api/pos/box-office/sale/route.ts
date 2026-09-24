import { NextResponse } from "next/server";
import { createCurrentBoxOfficeSale } from "@/modules/pos/application/pos-api";
import { boxOfficeSaleSchema } from "@/modules/pos/domain/box-office";

const ERRORS: Array<[string, string, number]> = [
  ["CASHIER_REQUIRED", "Esta caja no tiene un cajero asignado. Pedile al productor que lo asigne.", 409],
  ["BOX_OFFICE_CLOSED", "La taquilla ya está cerrada.", 409],
  ["BOX_OFFICE_NOT_OPERATIONAL", "La taquilla no está habilitada para este evento.", 409],
  ["CASH_SESSION_REQUIRED", "La caja ya no está abierta para vender.", 409],
  ["TICKET_TYPE_SOLD_OUT", "Ya no quedan entradas de ese tipo.", 409],
  ["EVENT_SOLD_OUT", "El evento está agotado.", 409],
  ["SALES_ENDED", "La venta de esa entrada ya terminó.", 409],
  ["SALES_NOT_STARTED", "La venta de esa entrada todavía no empezó.", 409],
  ["TICKET_TYPE_NOT_OPEN", "Esa entrada no está disponible ahora.", 409],
  ["TICKET_NOT_AVAILABLE_AT_BOX_OFFICE", "Esa entrada no se vende en taquilla.", 409],
  ["INVALID_SELECTION", "La cantidad supera el máximo por compra o la entrada no existe.", 400],
];

export async function POST(request: Request) {
  const parsed = boxOfficeSaleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Revisá los datos del comprador (el DNI debe tener 7 u 8 números)." }, { status: 400 });
  try { return NextResponse.json({ order: await createCurrentBoxOfficeSale(parsed.data) }); }
  catch (error) {
    const message = error instanceof Error ? error.message : "";
    const known = ERRORS.find(([code]) => message.includes(code));
    if (known) return NextResponse.json({ error: known[1] }, { status: known[2] });
    return NextResponse.json({ error: "No pudimos reservar la venta. Volvé a intentar." }, { status: 500 });
  }
}
