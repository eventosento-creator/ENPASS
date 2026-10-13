import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeCheck, LayoutDashboard, Ticket } from "lucide-react";
import { getPublicClubs } from "@/modules/clubs/application/public-queries";
import { resolveClubBrand } from "@/modules/clubs/domain/brand";
import { initialsOf } from "@/modules/clubs/domain/member-card";

export const metadata: Metadata = { title: "Ingresar", description: "Elegí cómo querés ingresar a ENPASS: comprador, socio de un club o productor." };

const optionClass = "card flex items-center gap-4 p-5 transition hover:-translate-y-0.5 hover:border-[var(--border-strong)]";

export default async function EnterPage() {
  const clubs = await getPublicClubs();
  return <main className="container-shell pb-16 pt-10">
    <p className="eyebrow">Ingresar</p>
    <h1 className="mt-2 text-3xl font-black tracking-[-.02em] sm:text-4xl">¿Cómo querés ingresar?</h1>
    <p className="mt-3 max-w-xl text-neutral-500">Elegí la opción que te corresponde.</p>

    <div className="mt-8 grid max-w-2xl gap-3">
      <Link href={"/mis-entradas" as never} className={optionClass}>
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[var(--surface-strong)]"><Ticket size={22}/></span>
        <span className="min-w-0 flex-1"><b className="block text-lg font-black">Compré entradas</b><span className="text-sm text-neutral-500">Mirá tus entradas y mostrá el QR en la puerta.</span></span>
        <ArrowRight size={18} className="shrink-0 text-neutral-500"/>
      </Link>
      <Link href="/login" className={optionClass}>
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[var(--surface-strong)]"><LayoutDashboard size={22}/></span>
        <span className="min-w-0 flex-1"><b className="block text-lg font-black">Soy productor o administro un club</b><span className="text-sm text-neutral-500">Entrá a tu panel para gestionar eventos, socios y cuotas.</span></span>
        <ArrowRight size={18} className="shrink-0 text-neutral-500"/>
      </Link>
    </div>

    <section aria-labelledby="socio-title" className="mt-10 max-w-2xl">
      <h2 id="socio-title" className="flex items-center gap-2 text-xl font-black"><BadgeCheck size={20}/>Soy socio de un club</h2>
      <p className="mt-2 text-sm text-neutral-500">Elegí tu club para ver tu carnet y tus cuotas.</p>
      {clubs.length > 0 ? <ul className="mt-4 grid gap-2">
        {clubs.map((club) => { const brand = resolveClubBrand(club.accentColor); return <li key={club.organizationId}>
          <Link href={`/mi-club/${club.slug}` as never} className="card flex items-center gap-3 p-3 transition hover:border-[var(--border-strong)]">
            {club.logoUrl /* eslint-disable-next-line @next/next/no-img-element */ ? <img src={club.logoUrl} alt="" className="size-11 shrink-0 rounded-xl border border-[var(--border)] bg-white object-contain p-1"/>
              : <span className="grid size-11 shrink-0 place-items-center rounded-xl text-sm font-black" style={{ background: brand?.accent ?? "var(--surface-strong)", color: brand?.onAccent ?? "inherit" }}>{initialsOf(club.name)}</span>}
            <span className="min-w-0 flex-1 truncate font-black">{club.name}</span>
            <ArrowRight size={16} className="shrink-0 text-neutral-500"/>
          </Link>
        </li>; })}
      </ul> : <p className="mt-4 text-sm text-neutral-500">Todavía no hay clubes publicados.</p>}
      <p className="mt-4 text-xs text-neutral-500">¿Tu club no aparece? Pedile el link de ingreso al club.</p>
    </section>
  </main>;
}
