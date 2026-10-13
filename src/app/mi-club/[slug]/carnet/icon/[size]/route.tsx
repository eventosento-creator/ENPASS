import { ImageResponse } from "next/og";
import { getPortalClub } from "@/modules/clubs/application/member-portal";
import { initialsOf, memberCardTheme } from "@/modules/clubs/domain/member-card";

const SIZES = new Set([180, 192, 512]);

// Ícono de la app instalada: logo del club sobre su color (o las iniciales si no cargó logo). Margen amplio para que sirva también como "maskable".
export async function GET(_: Request, { params }: { params: Promise<{ slug: string; size: string }> }) {
  const { slug, size: sizeText } = await params;
  const size = Number(sizeText);
  if (!SIZES.has(size)) return new Response("Tamaño no disponible", { status: 404 });
  const club = await getPortalClub(slug);
  if (!club) return new Response("No encontrado", { status: 404 });
  const theme = memberCardTheme(club.accentColor);
  const inner = Math.round(size * 0.56);
  const name = club.brandName ?? club.name;
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: theme.background, color: theme.onAccent }}>
      {club.logoUrl
        ? <div style={{ width: inner, height: inner, display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff", borderRadius: Math.round(inner * 0.22), padding: Math.round(inner * 0.08) }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={club.logoUrl} alt="" width={inner} height={inner} style={{ objectFit: "contain", width: "100%", height: "100%" }}/>
          </div>
        : <div style={{ fontSize: Math.round(size * 0.34), fontWeight: 900, letterSpacing: "-0.04em" }}>{initialsOf(name)}</div>}
    </div>,
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
