import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ChevronLeft, Search } from "lucide-react";
import { getPublicClubs } from "@/modules/clubs/application/public-queries";
import { resolveClubBrand } from "@/modules/clubs/domain/brand";
import { initialsOf } from "@/modules/clubs/domain/member-card";

export const metadata: Metadata = { title: "Ingresar como socio", description: "Buscá tu club para ver tu carnet digital y tus cuotas." };

const MAX_RESULTS = 8;
const normalize = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export default async function MemberEnterPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const query = ((await searchParams).q ?? "").slice(0, 60);
  const term = normalize(query);
  const clubs = term ? (await getPublicClubs()).filter((club) => normalize(club.name).includes(term)) : [];
  const shown = clubs.slice(0, MAX_RESULTS);
  return <main className="container-shell pb-16 pt-10">
    <Link href={"/ingresar" as never} className="inline-flex min-h-11 items-center gap-1 text-sm text-neutral-500"><ChevronLeft size={17}/>Volver</Link>
    <h1 className="mt-2 text-3xl font-black tracking-[-.02em] sm:text-4xl">¿De qué club sos socio?</h1>
    <p className="mt-3 max-w-xl text-neutral-500">Escribí el nombre de tu club para entrar a tu carnet y tus cuotas.</p>

    <form action="/ingresar/socio" className="mt-6 flex max-w-2xl gap-2" role="search">
      <label className="sr-only" htmlFor="club-q">Nombre del club</label>
      <input id="club-q" name="q" defaultValue={query} autoFocus autoComplete="off" placeholder="Nombre del club" className="field min-w-0 flex-1"/>
      <button type="submit" className="btn btn-primary"><Search size={17}/>Buscar</button>
    </form>

    <div className="mt-6 max-w-2xl">
      {term && shown.length > 0 && <ul className="grid gap-2">
        {shown.map((club) => { const brand = resolveClubBrand(club.accentColor); return <li key={club.organizationId}>
          <Link href={`/mi-club/${club.slug}` as never} className="card flex items-center gap-3 p-3 transition hover:border-[var(--border-strong)]">
            {club.logoUrl /* eslint-disable-next-line @next/next/no-img-element */ ? <img src={club.logoUrl} alt="" className="size-11 shrink-0 rounded-xl border border-[var(--border)] bg-white object-contain p-1"/>
              : <span className="grid size-11 shrink-0 place-items-center rounded-xl text-sm font-black" style={{ background: brand?.accent ?? "var(--surface-strong)", color: brand?.onAccent ?? "inherit" }}>{initialsOf(club.name)}</span>}
            <span className="min-w-0 flex-1"><b className="block truncate font-black">{club.name}</b>{club.location && <span className="block truncate text-xs text-neutral-500">{club.location}</span>}</span>
            <ArrowRight size={16} className="shrink-0 text-neutral-500"/>
          </Link>
        </li>; })}
      </ul>}
      {term && clubs.length > MAX_RESULTS && <p className="mt-3 text-sm text-neutral-500">Hay más resultados: escribí más del nombre para acotar.</p>}
      {term && shown.length === 0 && <p className="text-sm text-neutral-500">No encontramos ningún club con ese nombre. Revisá cómo está escrito o pedile al club el link de ingreso.</p>}
      {!term && <p className="text-sm text-neutral-500">¿No sabés cómo se escribe? También podés ver todos en <Link href={"/clubes" as never} className="underline">Clubes</Link>.</p>}
    </div>
  </main>;
}
