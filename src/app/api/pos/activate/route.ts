import { NextResponse } from "next/server";
import { activatePos, fingerprintPosRequest } from "@/modules/pos/application/pos-api";
import { posActivationSchema } from "@/modules/pos/domain/pos";
import { setPosSessionCookie } from "@/modules/pos/infrastructure/pos-session";

export async function POST(request: Request) {
  const parsed = posActivationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ingresá un PIN de 6 dígitos." }, { status: 400 });
  try {
    const result = await activatePos(parsed.data.pin, fingerprintPosRequest(request));
    if (result.activation.activation_status === "rate_limited") return NextResponse.json({ error: "Demasiados intentos. Esperá antes de volver a probar." }, { status: 429 });
    if (!result.rawSession || !result.session) return NextResponse.json({ error: "PIN inválido, vencido o ya utilizado." }, { status: 401 });
    await setPosSessionCookie(result.rawSession, result.session.expires_at);
    return NextResponse.json({ session: result.session });
  } catch { return NextResponse.json({ error: "No pudimos autorizar esta caja." }, { status: 500 }); }
}
