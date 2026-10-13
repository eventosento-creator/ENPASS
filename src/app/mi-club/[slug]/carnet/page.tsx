import type { Metadata, Viewport } from "next";
import { notFound, redirect } from "next/navigation";
import { getMemberProfile, getPortalClub } from "@/modules/clubs/application/member-portal";
import { refreshMemberQr } from "@/modules/clubs/application/member-portal-actions";
import { memberCardStatus, memberCardTheme } from "@/modules/clubs/domain/member-card";
import { MemberCard } from "@/modules/clubs/ui/member-card";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const club = await getPortalClub(slug);
  const clubName = club ? (club.brandName ?? club.name) : "Club";
  return {
    title: `Carnet · ${clubName}`,
    robots: { index: false, follow: false },
    manifest: `/mi-club/${slug}/carnet/manifest.webmanifest`,
    icons: { apple: `/mi-club/${slug}/carnet/icon/180` },
    appleWebApp: { capable: true, title: clubName, statusBarStyle: "black-translucent" },
  };
}

export async function generateViewport({ params }: { params: Promise<{ slug: string }> }): Promise<Viewport> {
  const { slug } = await params;
  const club = await getPortalClub(slug);
  return { themeColor: memberCardTheme(club?.accentColor).accent, width: "device-width", initialScale: 1, viewportFit: "cover" };
}

export default async function MemberCardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const club = await getPortalClub(slug);
  if (!club) notFound();
  const profile = await getMemberProfile(slug);
  // Sin sesión de socio se pide el ingreso (DNI o mail y contraseña) y de ahí se vuelve al carnet.
  if (!profile) redirect(`/mi-club/${slug}`);
  const [qr] = await Promise.all([refreshMemberQr(slug)]);
  const clubName = club.brandName ?? club.name;
  return <main className="min-h-dvh px-4 pb-10 pt-[max(1.25rem,env(safe-area-inset-top))]">
    <MemberCard slug={slug} clubName={clubName} logoUrl={club.logoUrl} theme={memberCardTheme(club.accentColor)}
      name={`${profile.first_name} ${profile.last_name}`} number={profile.member_number} category={profile.category_name} divisions={profile.divisions}
      status={memberCardStatus({ memberStatus: profile.member_status, overdueCount: profile.overdue_count, debtBlocksEntry: profile.debt_blocks_entry })} initialQr={qr}/>
  </main>;
}
