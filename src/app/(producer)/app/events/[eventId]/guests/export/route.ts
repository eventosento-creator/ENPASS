import { NextResponse, type NextRequest } from "next/server";
import { getEventGuestList } from "@/modules/events/application/guest-list";
import { toCsv } from "@/modules/promotions/domain/promotions";

// Descarga la lista de invitados: solo nombres (para llevar a la puerta) o completa (con DNI, tipo de entrada e ingreso).
export async function GET(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(eventId)) return new NextResponse("No encontrado", { status: 404 });
  const list = await getEventGuestList(eventId);
  if (!list) return new NextResponse("No encontrado", { status: 404 });
  const complete = request.nextUrl.searchParams.get("tipo") === "completa";
  const body = complete
    ? toCsv(["Apellido y nombre", "DNI", "Tipo de entrada", "Ingresó"], list.guests.map((guest) => [guest.name, guest.document, guest.typeLabel, guest.checkedIn ? "Sí" : "No"]))
    : toCsv(["Apellido y nombre"], list.guests.map((guest) => [guest.name]));
  const filename = `invitados-${list.event.slug}${complete ? "-completa" : ""}.csv`;
  return new NextResponse(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" } });
}
