import { NextResponse } from "next/server";
import { checkInPayload } from "@/modules/access/application/scanner-api";
import { scannerCheckInSchema } from "@/modules/access/domain/scanner";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = scannerCheckInSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Lectura inválida." }, { status: 400 });
  try {
    const checkin = await checkInPayload(parsed.data.payload, parsed.data.idempotencyKey);
    return NextResponse.json({ checkin });
  } catch {
    return NextResponse.json({ error: "No pudimos validar la entrada." }, { status: 500 });
  }
}
