import { NextResponse, type NextRequest } from "next/server";
import { getEventGuestList } from "@/modules/events/application/guest-list";
import { groupGuests } from "@/modules/events/domain/guest-groups";
import { toCsv } from "@/modules/promotions/domain/promotions";
import { buildGuestListPdf } from "@/modules/events/domain/guest-list-pdf";
import { formatEventDate } from "@/shared/lib/format";

// Descarga la lista de invitados: PDF (para imprimir o llevar a la puerta) o planilla CSV, solo con nombres o completa (DNI, tipo de entrada e ingreso).
export async function GET(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(eventId)) return new NextResponse("No encontrado", { status: 404 });
  const list = await getEventGuestList(eventId);
  if (!list) return new NextResponse("No encontrado", { status: 404 });
  if (request.nextUrl.searchParams.get("formato") === "pdf") {
    const bytes = await buildGuestListPdf({ eventName: list.event.name, dateLabel: formatEventDate(list.event.starts_at, "America/Argentina/Buenos_Aires"), guests: groupGuests(list.guests) });
    return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="invitados-${list.event.slug}.pdf"`, "Cache-Control": "no-store" } });
  }
  const complete = request.nextUrl.searchParams.get("tipo") === "completa";
  const body = complete
    ? toCsv(["Apellido y nombre", "DNI", "Tipo de entrada", "Ingresó"], list.guests.map((guest) => [guest.name, guest.document, guest.typeLabel, guest.checkedIn ? "Sí" : "No"]))
    : toCsv(["Apellido y nombre", "Entradas"], groupGuests(list.guests).map((group) => [group.name, group.count]));
  const filename = `invitados-${list.event.slug}${complete ? "-completa" : ""}.csv`;
  return new NextResponse(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" } });
}
