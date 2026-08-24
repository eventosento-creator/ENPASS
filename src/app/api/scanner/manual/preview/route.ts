import { NextResponse } from "next/server";
import { previewManualTicket } from "@/modules/access/application/scanner-api";
import { scannerManualSchema } from "@/modules/access/domain/scanner";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = scannerManualSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Código inválido." }, { status: 400 });
  try {
    return NextResponse.json({ ticket: await previewManualTicket(parsed.data.shortCode) });
  } catch (error) {
    if (error instanceof Error && error.message === "RATE_LIMITED") {
      return NextResponse.json({ error: "Demasiados intentos. Esperá un minuto." }, { status: 429 });
    }
    return NextResponse.json({ error: "Se requiere permiso de supervisor." }, { status: 403 });
  }
}
