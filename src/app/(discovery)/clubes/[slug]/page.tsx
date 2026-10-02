import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Users2 } from "lucide-react";
import { getPublicClubCategories, getPublicClubProfile } from "@/modules/clubs/application/public-queries";
import { MembershipRequestForm } from "@/modules/clubs/ui/membership-request-form";
import { formatMoney } from "@/shared/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const club = await getPublicClubProfile(slug);
  if (!club) return { title: "Club" };
  return { title: club.name, description: club.description ?? `Sumate como socio de ${club.name}.` };
}

export default async function ClubProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const club = await getPublicClubProfile(slug);
  if (!club) notFound();
  const categories = await getPublicClubCategories(club.organizationId);

  return <main className="container-shell pb-16 pt-10">
    <div className="flex items-center gap-4">
      {club.logoUrl ? <img src={club.logoUrl} alt={club.name} className="size-16 rounded-2xl border border-white/[.08] bg-white object-contain p-2"/> : <div className="grid size-16 place-items-center rounded-2xl bg-[var(--accent)] text-[var(--on-accent)]"><Users2 size={26}/></div>}
      <div><p className="eyebrow">Club</p><h1 className="text-2xl font-black tracking-[-.02em] sm:text-3xl">{club.name}</h1></div>
    </div>
    <p className="mt-4 text-sm text-neutral-500">¿Ya sos socio? <Link className="font-bold underline" href={`/mi-club/${club.slug}` as never}>Ingresá a tu perfil</Link> para ver tu QR y tus pagos.</p>
    {club.description && <p className="mt-5 max-w-2xl leading-7 text-neutral-400">{club.description}</p>}

    {categories.length > 0 && <section className="mt-8">
      <h2 className="text-sm font-bold text-neutral-400">Categorías</h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {categories.map((category) => <div key={category.id} className="card flex items-center justify-between p-3.5"><span className="font-bold">{category.name}</span><span className="text-sm text-neutral-400">{formatMoney(category.monthlyFeeAmount, club.currency)}/mes</span></div>)}
      </div>
    </section>}

    <section className="card mt-8 max-w-xl p-5 sm:p-7">
      <h2 className="text-xl font-bold">Quiero ser socio</h2>
      <p className="mt-1 text-sm text-neutral-500">Completá tus datos. El club revisa tu solicitud y te contacta.</p>
      {categories.length > 0 ? <MembershipRequestForm organizationId={club.organizationId} categories={categories}/> : <p className="mt-4 text-sm text-neutral-500">Este club todavía no tiene categorías abiertas.</p>}
    </section>
  </main>;
}
