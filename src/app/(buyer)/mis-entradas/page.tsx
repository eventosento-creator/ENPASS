import { cookies } from "next/headers";
import Link from "next/link";
import { KeyRound, LogOut, MapPin, Ticket } from "lucide-react";
import { BuyerAccessForm } from "@/modules/ticketing/ui/buyer-access-form";
import { EventCover } from "@/modules/events/ui/event-cover";
import { BUYER_SESSION_COOKIE, getBuyerSessionCustomerIds } from "@/modules/ticketing/application/buyer-access";
import { logoutBuyer } from "@/modules/ticketing/application/actions";
import { getTicketPresentationsForCustomers } from "@/modules/ticketing/application/queries";
import { formatEventDate } from "@/shared/lib/format";
import { EnpassLogo } from "@/shared/ui/brand";

export default async function MyTicketsPage({ searchParams }: { searchParams: Promise<{ access?: string }> }) {
  const query = await searchParams;
  const rawSession = (await cookies()).get(BUYER_SESSION_COOKIE)?.value;
  const customerIds = await getBuyerSessionCustomerIds(rawSession);
  const tickets = await getTicketPresentationsForCustomers(customerIds);

  if (customerIds.length === 0) return <main className="container-shell grid min-h-screen place-items-center py-8 sm:py-12"><section className="w-full max-w-md">
    <header className="mb-8 flex items-center justify-between"><Link href="/"><EnpassLogo/></Link><span className="flex items-center gap-1.5 text-xs text-neutral-600"><KeyRound size={14}/> Acceso sin contraseña</span></header>
    <div className="card p-6 sm:p-8"><div className="grid size-12 place-items-center rounded-2xl bg-[var(--accent)] text-[var(--on-accent)]"><Ticket size={23}/></div><p className="eyebrow mt-7">Mis accesos</p><h1 className="mt-3 text-4xl font-black tracking-[-.05em]">Encontrá tus entradas y mesas.</h1><p className="mt-4 text-sm leading-6 text-neutral-500">Ingresá el email que usaste para comprar. Te enviaremos un acceso seguro, sin contraseña.</p>{query.access === "invalid" && <p className="mt-5 rounded-xl border border-amber-300/10 bg-amber-300/[.04] p-4 text-sm text-amber-100/75" role="alert">Ese acceso venció o ya fue utilizado. Pedí uno nuevo.</p>}<BuyerAccessForm/></div>
  </section></main>;

  const currentTime = new Date().getTime();
  type EventGroup = { eventSlug: string; eventName: string; eventCoverUrl: string | null; startsAt: string; timezone: string; venueName: string; count: number };
  const groupsBySlug = new Map<string, EventGroup>();
  for (const ticket of tickets) {
    const existing = groupsBySlug.get(ticket.eventSlug);
    if (existing) existing.count += 1;
    else groupsBySlug.set(ticket.eventSlug, { eventSlug: ticket.eventSlug, eventName: ticket.eventName, eventCoverUrl: ticket.eventCoverUrl, startsAt: ticket.startsAt, timezone: ticket.timezone, venueName: ticket.venueName, count: 1 });
  }
  const groups = [...groupsBySlug.values()].sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());
  const upcomingGroups = groups.filter((group) => new Date(group.startsAt).getTime() >= currentTime);
  const pastGroups = groups.filter((group) => new Date(group.startsAt).getTime() < currentTime);

  return <main className="container-shell min-h-screen py-6 sm:py-10"><header className="mx-auto mb-6 flex max-w-2xl items-center justify-between gap-4"><Link href="/"><EnpassLogo/></Link><form action={logoutBuyer}><button className="btn btn-ghost min-h-10 px-3 text-xs" type="submit"><LogOut size={15}/> Salir</button></form></header><section className="mx-auto max-w-2xl"><div className="mb-6"><p className="eyebrow">Acceso personal</p><h1 className="mt-2 text-4xl font-black tracking-[-.05em]">Mis accesos</h1><p className="mt-2 text-sm text-neutral-500">{groups.length === 1 ? "1 evento" : `${groups.length} eventos`}</p></div>
    {groups.length > 0 ? <div className="grid gap-10">
      {upcomingGroups.length > 0 && <section><h2 className="mb-4 text-sm font-black uppercase tracking-[.12em] text-neutral-500">Próximos</h2><div className="grid gap-3">{upcomingGroups.map((group) => <EventGroupCard key={group.eventSlug} group={group}/>)}</div></section>}
      {pastGroups.length > 0 && <section><h2 className="mb-4 text-sm font-black uppercase tracking-[.12em] text-neutral-500">Pasados</h2><div className="grid gap-3">{pastGroups.map((group) => <EventGroupCard key={group.eventSlug} group={group}/>)}</div></section>}
    </div> : <div className="card p-8 text-center"><Ticket className="mx-auto text-neutral-600" size={32}/><h2 className="mt-4 text-xl font-black">Todavía no hay accesos emitidos</h2><p className="mt-2 text-sm text-neutral-500">Si tu pago ya fue confirmado, volvé a intentar en unos instantes.</p></div>}
  </section></main>;
}

function EventGroupCard({ group }: { group: { eventSlug: string; eventName: string; eventCoverUrl: string | null; startsAt: string; timezone: string; venueName: string; count: number } }) {
  return <Link href={`/mis-entradas/${group.eventSlug}` as never} className="card card-interactive flex items-center gap-4 p-4">
    <div className="relative size-16 shrink-0 overflow-hidden rounded-xl"><EventCover src={group.eventCoverUrl} alt={`Flyer de ${group.eventName}`} className="h-full w-full" sizes="64px"/></div>
    <div className="min-w-0 flex-1"><p className="truncate text-lg font-black tracking-[-.02em]">{group.eventName}</p><p className="mt-1 text-sm text-neutral-500">{formatEventDate(group.startsAt, group.timezone)}</p><p className="mt-1 flex items-center gap-1.5 text-xs text-neutral-600"><MapPin size={12}/>{group.venueName}</p></div>
    <span className="shrink-0 rounded-full bg-white/[.06] px-3 py-1.5 text-xs font-bold text-neutral-300">{group.count} {group.count === 1 ? "entrada" : "entradas"}</span>
  </Link>;
}
