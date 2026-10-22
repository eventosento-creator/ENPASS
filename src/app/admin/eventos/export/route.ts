import { NextResponse, type NextRequest } from "next/server";
import { getAdminEvents } from "@/modules/admin/application/queries";
import { isPlatformAdmin } from "@/modules/organizations/application/queries";
import { toCsv } from "@/modules/promotions/domain/promotions";

const pesos = (centavos: number) => (centavos / 100).toFixed(2);

// Descarga de la lista de eventos (con los mismos filtros de la pantalla) para planillas y contabilidad.
export async function GET(request: NextRequest) {
  if (!(await isPlatformAdmin())) return new NextResponse("No autorizado", { status: 403 });
  const params = request.nextUrl.searchParams;
  const scope = params.get("ver") === "past" || params.get("ver") === "all" ? (params.get("ver") as "past" | "all") : "upcoming";
  const organizationId = /^[0-9a-f-]{36}$/.test(params.get("org") ?? "") ? params.get("org") : null;
  const kind = params.get("tipo");
  const events = (await getAdminEvents(scope, (params.get("q") ?? "").slice(0, 80), organizationId)).filter((event) => !kind || (kind === "club") === event.is_club);
  const body = toCsv(["Evento", "Organiza", "Tipo", "Estado", "Fecha", "Entradas vendidas", "Capacidad", "Ventas (precio base)", "Cargo de ENPASS"],
    events.map((event) => [event.event_name, event.organization_name, event.is_club ? "Club" : "Productor", event.status, event.starts_at, event.tickets_sold, event.capacity, pesos(event.sales_amount), pesos(event.fee_amount)]));
  return new NextResponse(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="eventos.csv"', "Cache-Control": "no-store" } });
}
