import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getBoxOfficeOnlineActivity } from "@/modules/pos/application/pos-api";

const querySchema = z.object({ ticket: z.uuid(), since: z.iso.datetime() });

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse({ ticket: request.nextUrl.searchParams.get("ticket"), since: request.nextUrl.searchParams.get("since") });
  if (!parsed.success) return NextResponse.json({ error: "Consulta inválida." }, { status: 400 });
  try { return NextResponse.json(await getBoxOfficeOnlineActivity(parsed.data.ticket, parsed.data.since), { headers: { "cache-control": "no-store" } }); }
  catch { return NextResponse.json({ error: "No pudimos consultar las ventas." }, { status: 500 }); }
}
