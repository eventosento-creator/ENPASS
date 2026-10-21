import Link from "next/link";
import { Search } from "lucide-react";
import { getAdminEvents, getAdminProducers } from "@/modules/admin/application/queries";
import { formatMoneyCompact, formatShortDate } from "@/modules/admin/ui/format";

const scopes = [{ value: "upcoming", label: "Próximos" }, { value: "past", label: "Pasados" }, { value: "all", label: "Todos" }] as const;
const kinds = [{ value: "todos", label: "Todos" }, { value: "productor", label: "Productores" }, { value: "club", label: "Clubes" }] as const;
const statusLabels: Record<string, string> = { draft: "Borrador", published: "Publicado", sold_out: "Agotado", finished: "Finalizado", cancelled: "Cancelado" };

export default async function AdminEventsPage({ searchParams }: { searchParams: Promise<{ ver?: string; q?: string; org?: string; tipo?: string }> }) {
  const query = await searchParams;
  const scope = query.ver === "past" || query.ver === "all" ? query.ver : "upcoming";
  const search = (query.q ?? "").slice(0, 80);
  const kind = query.tipo === "club" || query.tipo === "productor" ? query.tipo : "todos";
  const organizationId = /^[0-9a-f-]{36}$/.test(query.org ?? "") ? (query.org as string) : null;
  const [events, producers] = await Promise.all([getAdminEvents(scope, search, organizationId), getAdminProducers()]);
  const rows = events.filter((event) => kind === "todos" || (kind === "club") === event.is_club);
  const href = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams();
    const next = { ver: scope, q: search, org: organizationId, tipo: kind === "todos" ? null : kind, ...patch };
    for (const [key, value] of Object.entries(next)) if (value && !(key === "ver" && value === "upcoming")) params.set(key, value);
    const text = params.toString();
    return (text ? `/admin/eventos?${text}` : "/admin/eventos") as never;
  };

  return <>
    <header><p className="eyebrow">Administración</p><h1 className="page-title mt-1">Eventos</h1><p className="mt-2 text-sm text-neutral-500">Todos los eventos de la plataforma, de productores y de clubes.</p></header>

    <form action="/admin/eventos" className="mt-6 flex flex-wrap items-center gap-2" role="search">
      <input type="hidden" name="ver" value={scope}/>{kind !== "todos" && <input type="hidden" name="tipo" value={kind}/>}
      <label className="sr-only" htmlFor="ev-q">Buscar evento o productor</label>
      <input id="ev-q" name="q" defaultValue={search} placeholder="Buscar evento o productor" className="field min-w-0 flex-1 sm:max-w-xs"/>
      <label className="sr-only" htmlFor="ev-org">Productor</label>
      <select id="ev-org" name="org" defaultValue={organizationId ?? ""} className="field w-auto"><option value="">Todos los productores</option>{producers.map((producer) => <option key={producer.organization_id} value={producer.organization_id}>{producer.organization_name}</option>)}</select>
      <button className="btn btn-secondary" type="submit"><Search size={16}/>Filtrar</button>
    </form>

    <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
      <nav aria-label="Cuándo" className="flex gap-1.5">{scopes.map((option) => <Pill key={option.value} href={href({ ver: option.value })} active={option.value === scope}>{option.label}</Pill>)}</nav>
      <nav aria-label="Tipo" className="flex gap-1.5">{kinds.map((option) => <Pill key={option.value} href={href({ tipo: option.value === "todos" ? null : option.value })} active={kind === option.value}>{option.label}</Pill>)}</nav>
    </div>

    <div className="mt-5 overflow-x-auto rounded-2xl border border-[var(--border)]">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-[var(--surface-strong)] text-xs font-bold text-neutral-500"><tr><th className="px-4 py-3">Evento</th><th className="px-4 py-3">Organiza</th><th className="px-4 py-3">Fecha</th><th className="px-4 py-3 text-right">Entradas</th><th className="px-4 py-3 text-right">Ventas</th><th className="px-4 py-3 text-right">Cargo ENPASS</th></tr></thead>
        <tbody className="divide-y divide-[var(--border)]">
          {rows.map((event) => <tr key={event.event_id} className="hover:bg-[var(--surface-strong)]/50">
            <td className="px-4 py-3"><Link href={`/admin/eventos/${event.event_id}` as never} className="font-black hover:underline">{event.event_name}</Link><span className="ml-2 rounded-full bg-[var(--surface-strong)] px-2 py-0.5 text-[11px] font-bold text-neutral-500">{statusLabels[event.status] ?? event.status}</span></td>
            <td className="px-4 py-3">{event.organization_name}{event.is_club && <span className="ml-2 rounded-full bg-[var(--bg-accent,#e6f1fb)] px-2 py-0.5 text-[11px] font-bold text-[var(--text-accent,#185fa5)]">Club</span>}</td>
            <td className="px-4 py-3 text-neutral-500">{formatShortDate(event.starts_at)}</td>
            <td className="px-4 py-3 text-right">{event.tickets_sold}{event.capacity ? <span className="text-neutral-500"> / {event.capacity}</span> : null}</td>
            <td className="px-4 py-3 text-right font-bold">{formatMoneyCompact(event.sales_amount)}</td>
            <td className="px-4 py-3 text-right">{formatMoneyCompact(event.fee_amount)}</td>
          </tr>)}
          {!rows.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-neutral-500">No hay eventos con esos filtros.</td></tr>}
        </tbody>
      </table>
    </div>
  </>;
}

function Pill({ href, active, children }: { href: never; active: boolean; children: React.ReactNode }) {
  return <Link href={href} aria-current={active ? "page" : undefined} className={`rounded-full border px-3.5 py-1.5 text-xs font-bold ${active ? "border-transparent bg-[var(--accent)] text-[var(--on-accent)]" : "border-[var(--border-strong)] text-neutral-500"}`}>{children}</Link>;
}
