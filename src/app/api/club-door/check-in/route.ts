import { NextResponse } from "next/server";
import { checkInMemberPayload } from "@/modules/clubs/application/club-door";
import { clubDoorCheckInSchema } from "@/modules/clubs/domain/club-door";

export async function POST(request: Request) {
  const parsed = clubDoorCheckInSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Lectura inválida." }, { status: 400 });
  try {
    return NextResponse.json({ checkin: await checkInMemberPayload(parsed.data.payload) });
  } catch {
    return NextResponse.json({ error: "No pudimos validar el código." }, { status: 500 });
  }
}
