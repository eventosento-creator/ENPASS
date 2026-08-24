import { NextResponse } from "next/server";
import { activateScanner, fingerprintScannerRequest } from "@/modules/access/application/scanner-api";
import { scannerActivationSchema } from "@/modules/access/domain/scanner";
import { setScannerSessionCookie } from "@/modules/access/infrastructure/scanner-session";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = scannerActivationSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Ingresá un PIN de 6 dígitos." }, { status: 400 });
  try {
    const { activation, rawSession, session } = await activateScanner(parsed.data.pin, fingerprintScannerRequest(request));
    if (activation.activation_status === "rate_limited") {
      return NextResponse.json({ error: "Demasiados intentos. Esperá antes de volver a probar.", retryAfter: activation.retry_after_seconds }, { status: 429 });
    }
    if (!rawSession || !session) return NextResponse.json({ error: "PIN inválido, vencido o ya utilizado." }, { status: 401 });
    await setScannerSessionCookie(rawSession, session.expires_at);
    return NextResponse.json({ session });
  } catch {
    return NextResponse.json({ error: "No pudimos autorizar el dispositivo." }, { status: 500 });
  }
}
