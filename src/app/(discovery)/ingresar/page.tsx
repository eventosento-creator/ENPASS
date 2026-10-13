import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeCheck, LayoutDashboard, Ticket } from "lucide-react";

export const metadata: Metadata = { title: "Ingresar", description: "Elegí cómo querés ingresar a ENPASS: comprador, socio de un club o productor." };

const optionClass = "card flex items-center gap-4 p-5 transition hover:-translate-y-0.5 hover:border-[var(--border-strong)]";

export default function EnterPage() {
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
      <Link href={"/ingresar/socio" as never} className={optionClass}>
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[var(--surface-strong)]"><BadgeCheck size={22}/></span>
        <span className="min-w-0 flex-1"><b className="block text-lg font-black">Soy socio de un club</b><span className="text-sm text-neutral-500">Buscá tu club y entrá a tu carnet y tus cuotas.</span></span>
        <ArrowRight size={18} className="shrink-0 text-neutral-500"/>
      </Link>
      <Link href="/login" className={optionClass}>
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[var(--surface-strong)]"><LayoutDashboard size={22}/></span>
        <span className="min-w-0 flex-1"><b className="block text-lg font-black">Soy productor o administro un club</b><span className="text-sm text-neutral-500">Entrá a tu panel para gestionar eventos, socios y cuotas.</span></span>
        <ArrowRight size={18} className="shrink-0 text-neutral-500"/>
      </Link>
    </div>

  </main>;
}
