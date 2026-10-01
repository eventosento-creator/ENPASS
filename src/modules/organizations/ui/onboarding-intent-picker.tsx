import Link from "next/link";
import { CalendarDays, Users2 } from "lucide-react";

export function OnboardingIntentPicker({ nextPath }: { nextPath: string }) {
  const suffix = `intent=event&next=${encodeURIComponent(nextPath)}`;
  const suffixClub = `intent=club&next=${encodeURIComponent(nextPath)}`;
  return <div className="mt-7 grid gap-4 sm:grid-cols-2">
    <Link href={`/app/onboarding?${suffix}` as never} className="card grid gap-4 p-6 text-left transition hover:border-white/20">
      <span className="grid size-12 place-items-center rounded-xl bg-[var(--accent)] text-[var(--on-accent)]"><CalendarDays size={22}/></span>
      <div><p className="text-lg font-black">Crear un evento</p><p className="mt-1 text-sm text-neutral-500">Fiestas, conciertos, shows — vendé entradas y gestioná accesos.</p></div>
    </Link>
    <Link href={`/app/onboarding?${suffixClub}` as never} className="card grid gap-4 p-6 text-left transition hover:border-white/20">
      <span className="grid size-12 place-items-center rounded-xl bg-[var(--accent)] text-[var(--on-accent)]"><Users2 size={22}/></span>
      <div><p className="text-lg font-black">Armar mi club</p><p className="mt-1 text-sm text-neutral-500">Padrón de socios, categorías y cobro de cuotas.</p></div>
    </Link>
  </div>;
}
