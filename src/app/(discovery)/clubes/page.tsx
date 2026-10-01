import type { Metadata } from "next";
import Link from "next/link";
import { Users2 } from "lucide-react";
import { getPublicClubs } from "@/modules/clubs/application/public-queries";
import { EmptyState } from "@/shared/ui/empty-state";

export const metadata: Metadata = { title: "Clubes", description: "Clubes que reciben nuevos socios a través de ENPASS." };

export default async function ClubsDirectoryPage() {
  const clubs = await getPublicClubs();
  return <main className="container-shell pb-16 pt-10">
    <p className="eyebrow">Clubes</p>
    <h1 className="mt-2 text-3xl font-black tracking-[-.02em] sm:text-4xl">Sumate a un club</h1>
    <p className="mt-3 max-w-xl text-neutral-500">Elegí un club y pedí ser socio directo desde acá.</p>

    {clubs.length > 0 ? <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {clubs.map((club) => <Link key={club.organizationId} href={`/clubes/${club.slug}` as never} className="card flex flex-col gap-4 p-5 transition hover:border-white/20">
        {club.logoUrl ? <img src={club.logoUrl} alt={club.name} className="size-14 rounded-xl border border-white/[.08] bg-white object-contain p-1.5"/> : <div className="grid size-14 place-items-center rounded-xl bg-[var(--accent)] text-[var(--on-accent)]"><Users2 size={22}/></div>}
        <div><p className="font-bold">{club.name}</p>{club.description && <p className="mt-1 line-clamp-2 text-sm text-neutral-500">{club.description}</p>}</div>
        <p className="mt-auto text-xs text-neutral-600">{club.categoryCount} {club.categoryCount === 1 ? "categoría" : "categorías"}</p>
      </Link>)}
    </div> : <EmptyState icon={Users2} title="Todavía no hay clubes publicados" description="Pronto vas a poder sumarte a un club desde acá."/>}
  </main>;
}
