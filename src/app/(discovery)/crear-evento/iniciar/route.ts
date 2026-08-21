import { NextResponse } from "next/server";
import { createClient } from "@/shared/database/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  const origin = requestOrigin(request);
  if (!user.user) {
    const login = new URL("/login", origin);
    login.searchParams.set("mode", "register");
    login.searchParams.set("next", "/app/events/new");
    return NextResponse.redirect(login);
  }
  const { data: membership } = await supabase.from("organization_members").select("organization_id").eq("user_id", user.user.id).limit(1).maybeSingle();
  return NextResponse.redirect(new URL(membership ? "/app/events/new" : "/app/onboarding?next=/app/events/new", origin));
}

function requestOrigin(request: Request) {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host");
  if (host) url.host = host;
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwardedProtocol === "http" || forwardedProtocol === "https") url.protocol = `${forwardedProtocol}:`;
  return url.origin;
}
