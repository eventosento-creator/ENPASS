import Link from "next/link";
import { CalendarDays, ChevronRight, LogOut, Sparkles, Ticket, WalletCards } from "lucide-react";
import { getCurrentPromoterSession, getPromoterDashboard } from "@/modules/promoters/application/access";
import { logoutPromoter } from "@/modules/promoters/application/actions";
import { getPromoterSessionHash } from "@/modules/promoters/infrastructure/session";
import { ShareLinkButtons } from "@/modules/promoters/ui/share-link-buttons";
import { formatCompactEventDate, formatMoney } from "@/shared/lib/format";

export default async function PromoterHomePage({ searchParams }: { searchParams: Promise<{ access?: string }> }) {
  const query = await searchParams;
  const sessionHash = await getPromoterSessionHash();
  const session = await getCurrentPromoterSession(sessionHash);
  if (!session || !sessionHash) return <AccessRequired invalid={query.access === "invalid"}/>;

  const events = await getPromoterDashboard(sessionHash);
  const totals = events.reduce((result, event) => ({
    tickets: result.tickets + event.tickets_sold,
    tables: result.tables + event.tables_sold,
    revenue: result.revenue + event.total_revenue,
    commission: result.commission + event.confirmed_commission,
  }), { tickets: 0, tables: 0, revenue: 0, commission: 0 });
  const currency = events[0]?.currency ?? "ARS";

  return <PromoterShell name={session.display_name}>
    <section className="relative overflow-hidden rounded-[1.75rem] border border-[var(--accent)]/15 bg-[linear-gradient(145deg,#1a1c13_0%,#111113_65%)] p-6 shadow-2xl sm:p-9">
      <div className="absolute -right-16 -top-16 size-48 rounded-full bg-[var(--accent)]/10 blur-3xl"/>
      <div className="relative">
        <p className="eyebrow">Tu actividad</p>
        <h1 className="mt-3 max-w-xl text-4xl font-black leading-[.96] tracking-[-.055em] sm:text-5xl">Todo lo que vendiste, claro.</h1>
        <div className={`mt-8 grid gap-6 border-t border-white/[.08] pt-7 sm:grid-cols-2 ${totals.tables > 0 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
          <HeroMetric label="Entradas" value={String(totals.tickets)}/>
          {totals.tables > 0 && <HeroMetric label="Mesas" value={String(totals.tables)}/>}
          <HeroMetric label="Ventas" value={formatMoney(totals.revenue, currency)}/>
          <HeroMetric label="Tu comisión" value={formatMoney(totals.commission, currency)} accent/>
        </div>
      </div>
    </section>

    <section className="mt-10">
      <div className="flex items-end justify-between gap-4"><div><p className="eyebrow">Tus fechas</p><h2 className="section-title mt-2">Eventos</h2></div><span className="text-xs font-semibold text-neutral-600">{events.length}</span></div>
      {events.length ? <div className="mt-4 grid gap-4">{events.map((event) => {
        const publicLink = absoluteUrl(`/e/${event.event_slug}/${event.public_slug}`);
        return <article className="card overflow-hidden" key={event.event_promoter_id}>
          <Link className="card-interactive block p-5 sm:p-6" href={`/promoter/events/${event.event_promoter_id}`}>
            <div className="flex items-start justify-between gap-5"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-xl font-black tracking-[-.03em]">{event.event_name}</h3>{event.relation_status === "inactive" && <span className="rounded-full bg-white/[.05] px-2 py-1 text-[10px] font-black uppercase tracking-wider text-neutral-600">Inactivo</span>}</div><p className="mt-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-neutral-600"><CalendarDays size={14}/>{formatCompactEventDate(event.event_starts_at, event.event_timezone)}</p></div><ChevronRight className="mt-1 shrink-0 text-neutral-700" size={20}/></div>
            <div className={`mt-6 grid gap-3 border-t border-white/[.07] pt-5 ${event.tables_sold > 0 ? "grid-cols-4" : "grid-cols-3"}`}><SmallMetric label="Entradas" value={String(event.tickets_sold)}/>{event.tables_sold > 0 && <SmallMetric label="Mesas" value={String(event.tables_sold)}/>}<SmallMetric label="Ventas" value={formatMoney(event.total_revenue, event.currency)}/><SmallMetric label="Comisión" value={formatMoney(event.confirmed_commission, event.currency)} accent/></div>
          </Link>
          {event.relation_status === "active" && <div className="border-t border-white/[.07] p-4 sm:px-6"><ShareLinkButtons url={publicLink} shareLabel="Compartir mi link"/></div>}
        </article>;
      })}</div> : <div className="card mt-4 px-6 py-14 text-center"><CalendarDays className="mx-auto text-neutral-700" size={34}/><h2 className="mt-5 text-xl font-black">Todavía no hay fechas</h2><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-neutral-500">Cuando te sumen a un evento, tu link y tus ventas van a aparecer acá.</p></div>}
    </section>
  </PromoterShell>;
}

function PromoterShell({ name, children }: { name: string; children: React.ReactNode }) {
  return <main className="min-h-screen bg-[radial-gradient(circle_at_top,#17190e_0%,#080809_35%)] pb-14"><header className="container-shell flex min-h-20 items-center justify-between gap-4"><Link href="/promoter" className="text-sm font-black tracking-[-.03em]">NIGHTLIFE OS <span className="ml-2 text-[10px] font-bold uppercase tracking-[.14em] text-[var(--accent)]">RRPP</span></Link><div className="flex items-center gap-2"><span className="hidden text-xs font-semibold text-neutral-500 sm:block">Hola, {name}</span><form action={logoutPromoter}><button type="submit" className="btn btn-ghost btn-icon min-h-11" aria-label="Cerrar sesión"><LogOut size={16}/></button></form></div></header><div className="container-shell">{children}</div></main>;
}

function AccessRequired({ invalid }: { invalid: boolean }) {
  return <main className="container-shell grid min-h-screen place-items-center py-10"><section className="card w-full max-w-lg p-7 text-center sm:p-10"><div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[var(--accent)] text-black"><Sparkles size={24}/></div><p className="eyebrow mt-7">Panel RRPP</p><h1 className="mt-3 text-3xl font-black tracking-[-.045em]">Tu link, tus ventas y tu comisión.</h1><p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-neutral-500">Abrí el acceso seguro que te compartió el productor. No necesitás contraseña.</p>{invalid && <p className="mt-6 rounded-xl border border-amber-300/10 bg-amber-300/[.04] p-4 text-sm text-amber-100/75" role="alert">Ese acceso venció o ya fue utilizado. Pedile uno nuevo al productor.</p>}<div className="mt-7 grid grid-cols-3 gap-3 border-t border-white/[.07] pt-6 text-neutral-600"><span className="grid justify-items-center gap-2 text-[10px] font-bold uppercase tracking-wider"><Ticket size={17}/>Ventas</span><span className="grid justify-items-center gap-2 text-[10px] font-bold uppercase tracking-wider"><WalletCards size={17}/>Comisión</span><span className="grid justify-items-center gap-2 text-[10px] font-bold uppercase tracking-wider"><Sparkles size={17}/>Tu link</span></div></section></main>;
}

function HeroMetric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) { return <div><p className="text-[10px] font-black uppercase tracking-[.13em] text-neutral-600">{label}</p><p className={`mt-2 text-3xl font-black tracking-[-.05em] sm:text-4xl ${accent ? "text-[var(--accent)]" : ""}`}>{value}</p></div>; }
function SmallMetric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) { return <div className="min-w-0"><p className="text-[9px] font-bold uppercase tracking-wider text-neutral-600">{label}</p><p className={`mt-1 truncate text-sm font-black sm:text-base ${accent ? "text-[var(--accent)]" : ""}`}>{value}</p></div>; }
function absoluteUrl(path: string) { return new URL(path, process.env.APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").toString(); }
