import { NextResponse } from "next/server";
import { manualCheckIn } from "@/modules/access/application/scanner-api";
import { scannerManualCheckInSchema } from "@/modules/access/domain/scanner";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = scannerManualCheckInSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Código inválido." }, { status: 400 });
  try {
    return NextResponse.json({ checkin: await manualCheckIn(parsed.data.shortCode, parsed.data.idempotencyKey) });
  } catch (error) {
    if (error instanceof Error && error.message === "RATE_LIMITED") {
      return NextResponse.json({ error: "Demasiados intentos. Esperá un minuto." }, { status: 429 });
    }
    return NextResponse.json({ error: "No pudimos registrar el ingreso manual." }, { status: 409 });
  }
}
