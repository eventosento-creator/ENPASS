import { NextRequest, NextResponse } from "next/server";
import { exchangePromoterAccessToken } from "@/modules/promoters/application/access";
import { PROMOTER_SESSION_COOKIE, PROMOTER_SESSION_MAX_AGE_SECONDS } from "@/modules/promoters/domain/session";
import { localRequestUrl } from "@/shared/lib/request-url";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const session = await exchangePromoterAccessToken(token);
  const destination = localRequestUrl(request, "/promoter");
  if (!session) {
    destination.searchParams.set("access", "invalid");
    return NextResponse.redirect(destination);
  }

  const response = NextResponse.redirect(destination);
  response.cookies.set(PROMOTER_SESSION_COOKIE, session.rawSession, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: session.expiresAt,
    maxAge: PROMOTER_SESSION_MAX_AGE_SECONDS,
    priority: "high",
  });
  return response;
}
