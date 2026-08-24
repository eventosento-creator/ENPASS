import { NextRequest, NextResponse } from "next/server";
import { recordPromoterAttribution } from "@/modules/promoters/application/attribution";
import { PROMOTER_ATTRIBUTION_COOKIE, PROMOTER_ATTRIBUTION_MAX_AGE_SECONDS } from "@/modules/promoters/domain/session";
import { localRequestUrl } from "@/shared/lib/request-url";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; promoterSlug: string }> },
) {
  const { slug, promoterSlug } = await params;
  const result = await recordPromoterAttribution(
    slug,
    promoterSlug,
    request.cookies.get(PROMOTER_ATTRIBUTION_COOKIE)?.value,
  );
  const response = NextResponse.redirect(localRequestUrl(request, `/e/${slug}`));
  if (result) {
    response.cookies.set(PROMOTER_ATTRIBUTION_COOKIE, result.rawCredential, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: PROMOTER_ATTRIBUTION_MAX_AGE_SECONDS,
      priority: "high",
    });
  }
  return response;
}
