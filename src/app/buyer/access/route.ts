import { NextRequest, NextResponse } from "next/server";
import { BUYER_SESSION_COOKIE, BUYER_SESSION_MAX_AGE_SECONDS, exchangeBuyerAccessToken, safeNextPath } from "@/modules/ticketing/application/buyer-access";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const session = await exchangeBuyerAccessToken(token);
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  const destination = new URL(next ?? "/mis-entradas", request.url);
  if (!session) {
    const failed = new URL("/mis-entradas", request.url);
    failed.searchParams.set("access", "invalid");
    return NextResponse.redirect(failed);
  }

  const response = NextResponse.redirect(destination);
  response.cookies.set(BUYER_SESSION_COOKIE, session.rawSession, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: session.expiresAt,
    maxAge: BUYER_SESSION_MAX_AGE_SECONDS,
    priority: "high",
  });
  return response;
}
