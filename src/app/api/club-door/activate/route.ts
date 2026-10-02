import { NextResponse } from "next/server";
import { activateClubDoor, fingerprintScannerRequest } from "@/modules/clubs/application/club-door";
import { clubDoorActivationSchema } from "@/modules/clubs/domain/club-door";
import { setClubDoorCookie } from "@/modules/clubs/infrastructure/club-door-session";

export async function POST(request: Request) {
  const parsed = clubDoorActivationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ingresá un PIN de 6 dígitos." }, { status: 400 });
  try {
    const { activation, rawSession, session } = await activateClubDoor(parsed.data.pin, fingerprintScannerRequest(request));
    if (activation.activation_status === "rate_limited") return NextResponse.json({ error: "Demasiados intentos. Esperá antes de volver a probar.", retryAfter: activation.retry_after_seconds }, { status: 429 });
    if (!rawSession || !session) return NextResponse.json({ error: "PIN inválido o vencido." }, { status: 401 });
    await setClubDoorCookie(rawSession, session.expires_at);
    return NextResponse.json({ session });
  } catch {
    return NextResponse.json({ error: "No pudimos autorizar el dispositivo." }, { status: 500 });
  }
}
