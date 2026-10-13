import { NextResponse } from "next/server";
import { getPortalClub } from "@/modules/clubs/application/member-portal";
import { buildCarnetManifest } from "@/modules/clubs/domain/member-card";

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const club = await getPortalClub(slug);
  if (!club) return new NextResponse("No encontrado", { status: 404 });
  return NextResponse.json(buildCarnetManifest({ slug: club.slug, name: club.brandName ?? club.name, accentColor: club.accentColor }), {
    headers: { "Content-Type": "application/manifest+json; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
}
