import { CalendarDays, CreditCard, MapPin, Trophy, Users2 } from "lucide-react";
import { getClubBannerData } from "../application/queries";
import { resolveClubBrand } from "../domain/brand";
import { formatMoney } from "@/shared/lib/format";

/** Banner del panel del club: portada (o color del club), logo, nombre, ubicación y 4 números clave. */
export async function ClubBanner({ organizationId }: { organizationId: string }) {
  const club = await getClubBannerData(organizationId);
  const brand = resolveClubBrand(club.accentColor);
  const stats = [
    { icon: Users2, value: String(club.activeMembers), label: club.activeMembers === 1 ? "Socio activo" : "Socios activos" },
    ...(club.nextDueDate ? [{ icon: CalendarDays, value: new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${club.nextDueDate}T00:00:00Z`)).replace(".", ""), label: "Próximo vencimiento" }] : []),
    ...(club.feeFrom !== null ? [{ icon: CreditCard, value: formatMoney(club.feeFrom, club.currency), label: club.feeIsSingle ? "Cuota mensual" : "Cuota desde" }] : []),
    ...(club.activity ? [{ icon: Trophy, value: club.activity, label: "Actividad principal" }] : []),
  ];
  return <section className="relative -mt-2 mb-8 overflow-hidden rounded-[1.5rem] text-white" style={{ background: brand?.gradient ?? "#17171a" }}>
    {club.coverUrl && <>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={club.coverUrl} alt="" className="absolute inset-0 size-full object-cover"/><div aria-hidden className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/55 to-black/20"/></>}
    {!club.coverUrl && !brand && <div aria-hidden className="absolute inset-0 bg-gradient-to-br from-neutral-800 to-neutral-950"/>}
    <div className="relative flex flex-col gap-5 px-5 pb-6 pt-8 sm:flex-row sm:items-center sm:gap-7 sm:px-9 sm:pt-10">
      {club.logoUrl /* eslint-disable-next-line @next/next/no-img-element */ ? <img src={club.logoUrl} alt={`Logo de ${club.name}`} className="size-24 shrink-0 rounded-full border-4 bg-white object-contain p-1 shadow-xl sm:size-32" style={{ borderColor: "rgba(255,255,255,.9)" }}/> : <div className="grid size-24 shrink-0 place-items-center rounded-full border-4 sm:size-32" style={{ background: "rgba(255,255,255,.12)", borderColor: "rgba(255,255,255,.35)" }}><Users2 size={38}/></div>}
      <div className="min-w-0">
        <span className="inline-block rounded-md px-2 py-0.5 text-[11px] font-black uppercase tracking-[.12em]" style={{ background: "rgba(255,255,255,.92)", color: "#0a0a0b" }}>Tu club</span>
        <h2 className="mt-2 text-4xl font-black leading-[1.05] tracking-[-.02em] !text-white sm:text-5xl">{club.name}</h2>
        {club.location && <p className="mt-2 flex items-center gap-1.5 text-sm !text-white/85"><MapPin aria-hidden size={15}/>{club.location}</p>}
        {club.description && <p className="mt-2 line-clamp-2 max-w-xl text-sm leading-6 !text-white/80">{club.description}</p>}
      </div>
    </div>
    <dl className="relative grid grid-cols-2 gap-px border-t backdrop-blur sm:grid-cols-4" style={{ background: "rgba(0,0,0,.5)", borderColor: "rgba(255,255,255,.12)" }}>
      {stats.map((stat) => <div key={stat.label} className="flex items-center gap-3 px-5 py-4"><span className="grid size-10 shrink-0 place-items-center rounded-full" style={{ background: "rgba(255,255,255,.12)" }}><stat.icon aria-hidden size={17}/></span><div className="min-w-0"><dd className="truncate font-black !text-white">{stat.value}</dd><dt className="truncate text-xs !text-white/70">{stat.label}</dt></div></div>)}
    </dl>
  </section>;
}
