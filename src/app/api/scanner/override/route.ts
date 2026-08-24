import { NextResponse } from "next/server";
import { overrideCheckIn } from "@/modules/access/application/scanner-api";
import { scannerOverrideSchema } from "@/modules/access/domain/scanner";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = scannerOverrideSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Excepción inválida." }, { status: 400 });
  try {
    const checkin = await overrideCheckIn(parsed.data.checkinId, parsed.data.reason, parsed.data.idempotencyKey);
    return NextResponse.json({ checkin });
  } catch (error) {
    const forbidden = error instanceof Error && error.message === "SUPERVISOR_REQUIRED";
    return NextResponse.json({ error: forbidden ? "Se requiere permiso de supervisor." : "No se puede autorizar esta excepción." }, { status: forbidden ? 403 : 409 });
  }
}
