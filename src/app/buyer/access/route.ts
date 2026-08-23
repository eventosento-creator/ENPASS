import { NextRequest, NextResponse } from "next/server";
import { BUYER_SESSION_COOKIE, BUYER_SESSION_MAX_AGE_SECONDS, exchangeBuyerAccessToken } from "@/modules/ticketing/application/buyer-access";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const session = await exchangeBuyerAccessToken(token);
  const destination = new URL("/mis-entradas", request.url);
  if (!session) {
    destination.searchParams.set("access", "invalid");
    return NextResponse.redirect(destination);
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
