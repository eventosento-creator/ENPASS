import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Users2 } from "lucide-react";
import { getMemberProfile, getPortalClub } from "@/modules/clubs/application/member-portal";
import { getPublicClubProfile } from "@/modules/clubs/application/public-queries";
import { MemberHub } from "@/modules/clubs/ui/member-hub";
import { MemberLoginForm } from "@/modules/clubs/ui/member-login-form";

export const metadata: Metadata = { title: "Mi perfil de socio", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function MemberPortalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const club = await getPortalClub(slug);
  if (!club) notFound();
  const profile = await getMemberProfile(slug);
  const clubName = club.brandName ?? club.name;
  const header = <div className="flex items-center gap-3">
    {club.logoUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={club.logoUrl} alt={clubName} className="size-12 rounded-xl border border-white/[.08] bg-white object-contain p-1.5"/> : <div className="grid size-12 place-items-center rounded-xl bg-[var(--accent)] text-[var(--on-accent)]"><Users2 size={22}/></div>}
    <div><p className="eyebrow">Perfil de socio</p><h1 className="text-2xl font-black tracking-[-.02em]">{clubName}</h1></div>
  </div>;

  if (!profile) return <main className="container-shell max-w-md pb-16 pt-10">
    {header}
    <p className="mt-5 text-sm leading-6 text-neutral-500">Entrá con tu DNI o tu mail para ver tu estado, tus pagos y tu QR de ingreso al club.</p>
    <MemberLoginForm slug={slug}/>
  </main>;

  // Un solo link por club: si el club tiene página pública, el socio ve su cuota ahí, junto a los eventos.
  if (await getPublicClubProfile(slug)) redirect(`/clubes/${slug}#mi-cuota` as never);
  return <main className="container-shell max-w-2xl pb-16 pt-10">
    {header}
    <div className="mt-7"><MemberHub slug={slug}/></div>
  </main>;
}
