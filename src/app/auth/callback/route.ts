import { NextResponse } from "next/server";
import { createClient } from "@/shared/database/server";
import { safeAuthPath } from "@/shared/lib/navigation";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(safeAuthPath(searchParams.get("next")), origin));
  }
  return NextResponse.redirect(new URL("/login?authError=invalid-link", origin));
}
