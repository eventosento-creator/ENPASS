import { NextResponse } from "next/server";
import { getCurrentBoxOfficeState } from "@/modules/pos/application/pos-api";

export async function GET() {
  const state = await getCurrentBoxOfficeState();
  return NextResponse.json({ boxOffice: state });
}
