import type { Metadata } from "next";
import Link from "next/link";
import { Users2 } from "lucide-react";
import { getPublicClubs } from "@/modules/clubs/application/public-queries";
import { resolveClubBrand } from "@/modules/clubs/domain/brand";
import { EmptyState } from "@/shared/ui/empty-state";

export const metadata: Metadata = { title: "Clubes", description: "Clubes que reciben nuevos socios a través de ENPASS." };

export default async function ClubsDirectoryPage() {
  const clubs = await getPublicClubs();
  return <main className="container-shell pb-16 pt-10">
    <p className="eyebrow">Clubes</p>
    <h1 className="mt-2 text-3xl font-black tracking-[-.02em] sm:text-4xl">Sumate a un club</h1>
    <p className="mt-3 max-w-xl text-neutral-500">Elegí un club y pedí ser socio directo desde acá.</p>

    {clubs.length > 0 ? <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {clubs.map((club) => { const brand = resolveClubBrand(club.accentColor); return <Link key={club.organizationId} href={`/clubes/${club.slug}` as never} className="card group flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:border-[var(--border-strong)]">
        <div className="relative h-24 w-full" style={{ background: brand?.gradient ?? "var(--surface-strong)" }}>{club.coverUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={club.coverUrl} alt="" className="absolute inset-0 size-full object-cover"/>}</div>
        <div className="flex flex-1 flex-col gap-3 p-5 pt-0">
          {club.logoUrl ? <img src={club.logoUrl} alt={club.name} className="relative z-10 -mt-8 size-16 rounded-2xl border border-[var(--border)] bg-white object-contain p-1.5 shadow-[var(--shadow-sm)]"/> : <div className="relative z-10 -mt-8 grid size-16 place-items-center rounded-2xl bg-[var(--accent)] text-[var(--on-accent)] shadow-[var(--shadow-sm)]"><Users2 size={24}/></div>}
          <div><p className="font-black">{club.name}</p>{club.description && <p className="mt-1 line-clamp-2 text-sm text-neutral-500">{club.description}</p>}</div>
          <p className="mt-auto text-xs text-neutral-600">{club.location ? `${club.location} · ` : ""}{club.categoryCount} {club.categoryCount === 1 ? "categoría" : "categorías"}</p>
        </div>
      </Link>; })}
    </div> : <EmptyState icon={Users2} title="Todavía no hay clubes publicados" description="Pronto vas a poder sumarte a un club desde acá."/>}
  </main>;
}
