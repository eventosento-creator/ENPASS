import { NextResponse, type NextRequest } from "next/server";
import { getCurrentOrganization } from "@/modules/organizations/application/queries";
import { getPromotionsOverview, listPromotionRedemptions } from "@/modules/promotions/application/queries";
import { describeDiscount, promotionStatusLabels, redemptionStatusLabels, toCsv } from "@/modules/promotions/domain/promotions";

const pesos = (centavos: number) => (centavos / 100).toFixed(2);

export async function GET(request: NextRequest) {
  const organization = await getCurrentOrganization();
  if (!organization || !["owner", "admin"].includes(organization.role)) return new NextResponse("No autorizado", { status: 403 });
  const params = request.nextUrl.searchParams;
  const money = (centavos: number) => `$${pesos(centavos)}`;

  let body: string;
  let filename: string;
  if (params.get("kind") === "redemptions") {
    const rows = await listPromotionRedemptions(organization.id, { promotionId: params.get("promotion") || undefined, status: params.get("status") || undefined, limit: 5000 });
    body = toCsv(["Fecha", "Código", "Estado", "Orden", "Evento", "Comprador", "Email", "Entradas con descuento", "Precio base", "Descuento", "Total pagado", "Referencia de pago"],
      rows.map((row) => [row.created_at, row.code, redemptionStatusLabels[row.status] ?? row.status, row.order_public_id, row.event_name, row.buyer_name, row.buyer_email, row.tickets_benefited, pesos(row.list_subtotal_amount), pesos(row.discount_amount), pesos(row.order_total_amount), row.payment_reference]));
    filename = "cupones-historial.csv";
  } else {
    const { rows } = await getPromotionsOverview(organization.id, {
      eventId: params.get("event") || undefined, status: params.get("status") || undefined, search: params.get("q") || undefined,
      from: params.get("from") ? new Date(`${params.get("from")}T00:00:00-03:00`).toISOString() : undefined,
      to: params.get("to") ? new Date(new Date(`${params.get("to")}T23:59:59-03:00`).getTime() + 1000).toISOString() : undefined,
    });
    body = toCsv(["Código", "Nombre", "Descuento", "Estado", "Usos confirmados", "Límite de usos", "Usos en curso", "Reembolsados", "Entradas con descuento", "Compradores", "Ventas con cupón", "Ahorro otorgado"],
      rows.map((row) => [row.code, row.name, describeDiscount(row, money), promotionStatusLabels[row.status], row.uses_confirmed, row.max_total_uses, row.uses_pending, row.uses_refunded, row.tickets_benefited, row.buyers, pesos(row.sales_amount), pesos(row.discount_amount)]));
    filename = "cupones.csv";
  }
  return new NextResponse(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" } });
}
