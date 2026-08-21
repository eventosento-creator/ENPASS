import { NextResponse } from "next/server";
import { createClient } from "@/shared/database/server";
import { safeProducerPath } from "@/shared/lib/navigation";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  if (code) { const supabase = await createClient(); await supabase.auth.exchangeCodeForSession(code); }
  return NextResponse.redirect(new URL(safeProducerPath(searchParams.get("next")), origin));
}
