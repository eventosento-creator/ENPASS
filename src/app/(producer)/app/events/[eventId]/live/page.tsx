import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, DoorOpen, FileText, ScanLine, ShieldAlert, Smartphone, Store, TriangleAlert } from "lucide-react";
import { createClient } from "@/shared/database/server";
import { formatMoney } from "@/shared/lib/format";
import { EventSectionNav } from "@/modules/events/ui/event-section-nav";
import { EventStatusBadge } from "@/modules/events/ui/event-status-badge";
import { LiveRefresher } from "@/modules/events/ui/live-refresher";
import { DisabledEventModule } from "@/modules/events/ui/disabled-event-module";
import { getEventCapabilities } from "@/modules/events/domain/event-profile";
import { getEventViewerRole, restrictCapabilitiesForCollaborator } from "@/modules/events/application/viewer";
import { getEventReadiness } from "@/modules/events/application/event-readiness";
import { buildLiveAlerts, isEventLiveWindow, presenceLabels, scannerPresence, timeAgo, type ScannerPresence } from "@/modules/events/domain/event-live";
import type { CheckInResult } from "@/shared/database/types";

export const dynamic = "force-dynamic";

const resultLabels: Record<CheckInResult, string> = {
  valid: "Ingreso válido", already_used: "Ya utilizada", invalid: "Lectura inválida", wrong_event: "Otro evento", wrong_gate: "Puerta incorrecta", too_early: "Demasiado temprano",
  too_late: "Fuera de horario", cancelled: "Cancelada", refunded: "Reembolsada", expired: "Expirada", device_not_authorized: "Dispositivo no autorizado", rate_limited: "Muy rápido",
};
const presenceDot: Record<ScannerPresence, string> = { online: "bg-lime-400", slow: "bg-amber-400", offline: "bg-red-500", inactive: "bg-neutral-400" };

export default async function LiveEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(eventId)) notFound();
  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("*").eq("id", eventId).single();
  if (!event) notFound();
  const isManager = (await getEventViewerRole(event.organization_id)) === "manager";
  const capabilities = isManager ? getEventCapabilities(event) : restrictCapabilitiesForCollaborator(getEventCapabilities(event));
  if (!capabilities.access) return <DisabledEventModule eventId={event.id} eventName={event.name} moduleName="Control de acceso"/>;

  const since = new Date(new Date().getTime() - 30 * 60_000).toISOString();
  const [{ data: venue }, { data: gates }, { data: authorizations }, { data: sessions }, { data: validCheckins }, { data: recent }, { data: soldRows }, rejectedRecent, wrongGateRecent, boxSettingsResult, readiness] = await Promise.all([
    supabase.from("venues").select("timezone").eq("id", event.venue_id).single(),
    supabase.from("access_gates").select("id, name, active").eq("event_id", eventId).order("created_at"),
    supabase.from("scanner_device_authorizations").select("id, access_gate_id, label, permission, activation_count, revoked_at, session_expires_at").eq("event_id", eventId),
    supabase.from("scanner_sessions").select("authorization_id, last_seen_at, expires_at, revoked_at").eq("event_id", eventId),
    supabase.from("checkins").select("access_gate_id").eq("event_id", eventId).eq("result", "valid"),
    supabase.rpc("get_event_recent_checkins", { target_event: eventId, result_limit: 12 }),
    isManager ? supabase.rpc("get_events_occupancy", { target_org: event.organization_id }) : Promise.resolve({ data: null }),
    supabase.from("checkins").select("id", { count: "exact", head: true }).eq("event_id", eventId).neq("result", "valid").gt("scanned_at", since).then(({ count }) => count ?? 0),
    supabase.from("checkins").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("result", "wrong_gate").gt("scanned_at", since).then(({ count }) => count ?? 0),
    isManager ? supabase.from("event_box_office_settings").select("enabled").eq("event_id", eventId).maybeSingle() : Promise.resolve({ data: null }),
    isManager ? getEventReadiness(event, capabilities) : Promise.resolve(null),
  ]);
  const timezone = venue?.timezone ?? "America/Argentina/Mendoza";
  const boxOfficeOn = !!boxSettingsResult.data?.enabled && event.pos_enabled;
  const [{ data: boxSummary }, { data: boxRegisters }] = boxOfficeOn
    ? await Promise.all([supabase.rpc("get_box_office_summary", { target_event: eventId }), supabase.rpc("get_box_office_registers", { target_event: eventId })])
    : [{ data: null }, { data: null }];

  const now = new Date().getTime();
  const entriesByGate = (validCheckins ?? []).reduce<Record<string, number>>((total, row) => row.access_gate_id ? { ...total, [row.access_gate_id]: (total[row.access_gate_id] ?? 0) + 1 } : total, {});
  const entered = (validCheckins ?? []).length;
  const sold = soldRows ? Number((soldRows as { event_id: string; tickets_sold: number }[]).find((row) => row.event_id === eventId)?.tickets_sold ?? 0) : null;
  const pending = sold === null ? null : Math.max(0, sold - entered);
  const pct = sold && sold > 0 ? Math.min(100, Math.round((entered / sold) * 100)) : 0;

  const scanners = (authorizations ?? []).map((authorization) => {
    const latest = (sessions ?? []).filter((session) => session.authorization_id === authorization.id && !session.revoked_at).sort((a, b) => new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime())[0];
    const presence = scannerPresence({ activated: authorization.activation_count > 0, revoked: !!authorization.revoked_at, sessionExpiresAt: latest?.expires_at ?? authorization.session_expires_at, lastSeenAt: latest?.last_seen_at ?? null }, now);
    return { id: authorization.id, label: authorization.label, gateId: authorization.access_gate_id, supervisor: authorization.permission === "supervisor", presence, lastSeenAt: latest?.last_seen_at ?? null };
  }).filter((scanner) => scanner.presence !== "inactive" || true).sort((a, b) => a.label.localeCompare(b.label, "es-AR"));
  const gateName = new Map((gates ?? []).map((gate) => [gate.id, gate.name]));

  const configErrors = readiness ? readiness.items.filter((item) => item.level === "error" && ["gates", "coverage"].includes(item.key)).length : 0;
  const alerts = buildLiveAlerts({ eventId, doorsOpen: isEventLiveWindow(event.starts_at, event.ends_at, now), scanners, wrongGateRecent, configErrors, rejectedRecent });
  const time = (value: string) => new Intl.DateTimeFormat("es-AR", { timeZone: timezone, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(value));
  const boxTotals = (boxSummary ?? []).reduce((sum, row) => ({ tickets: sum.tickets + row.ticket_count, gmv: sum.gmv + row.gmv_amount, sales: sum.sales + row.sale_count }), { tickets: 0, gmv: 0, sales: 0 });
  const openRegisters = (boxRegisters ?? []).filter((register) => register.status === "open");

  return <>
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><Link href={`/app/events/${event.id}`} className="inline-flex items-center gap-2 text-sm font-bold text-neutral-500"><ArrowLeft size={16}/>Volver al evento</Link>
        <p className="eyebrow mt-6">Evento en vivo</p><div className="mt-2 flex flex-wrap items-center gap-3"><h1 className="page-title">{event.name}</h1><EventStatusBadge status={event.status}/></div></div>
      <LiveRefresher renderedAt={time(new Date(now).toISOString())}/>
    </header>
    <EventSectionNav eventId={event.id} active="live" capabilities={capabilities}/>

    {alerts.length > 0 && <section aria-label="Alertas" className="mt-6 grid gap-3">{alerts.map((alert) => <div key={alert.key} role="alert" className={`flex flex-wrap items-start gap-3 rounded-2xl border p-4 ${alert.level === "error" ? "border-red-500/40 bg-red-500/[.07]" : "border-amber-400/40 bg-amber-400/[.07]"}`}>
      {alert.level === "error" ? <ShieldAlert size={20} className="mt-0.5 shrink-0 text-red-500" aria-hidden/> : <TriangleAlert size={20} className="mt-0.5 shrink-0 text-amber-500" aria-hidden/>}
      <div className="min-w-[12rem] flex-1"><p className="text-sm font-black">{alert.title}</p><p className="text-xs leading-5 text-neutral-500">{alert.detail}</p></div>
      {alert.href && <Link href={alert.href as never} className="btn btn-secondary min-h-9 shrink-0 px-3.5 text-xs">{alert.action ?? "Ver"}</Link>}
    </div>)}</section>}

    <section className="card mt-6 p-5 sm:p-7" aria-label="Ingresos">
      <p className="text-xs font-bold uppercase tracking-[.12em] text-neutral-500">Adentro</p>
      <p className="mt-1 text-6xl font-black tracking-[-.04em] sm:text-7xl">{entered}<span className="text-2xl font-bold text-neutral-500"> {sold !== null ? `/ ${sold}` : ""}</span></p>
      {sold !== null && <><div className="mt-4 h-3 overflow-hidden rounded-full bg-[var(--surface-strong)]" role="img" aria-label={`${pct}% de las entradas vendidas ya ingresó`}><div className="h-full rounded-full bg-[var(--accent)] transition-[width]" style={{ width: `${pct}%` }}/></div>
        <p className="mt-2 text-sm text-neutral-500">{pct}% de las entradas vendidas ya ingresó · faltan ingresar <b className="text-[var(--text)]">{pending}</b></p></>}
    </section>

    <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Resumen de lecturas">
      <Stat label="Rechazadas (30 min)" value={String(rejectedRecent)} tone={rejectedRecent >= 8 ? "warn" : undefined}/>
      <Stat label="Puerta incorrecta (30 min)" value={String(wrongGateRecent)} tone={wrongGateRecent >= 2 ? "bad" : undefined}/>
      <Stat label="Scanners en línea" value={`${scanners.filter((scanner) => scanner.presence === "online").length} / ${scanners.filter((scanner) => scanner.presence !== "inactive").length}`}/>
      <Stat label="Puertas operativas" value={String((gates ?? []).filter((gate) => gate.active).length)}/>
    </section>

    <section className="mt-6 grid gap-4 lg:grid-cols-2">
      <div className="card p-5"><h2 className="flex items-center gap-2 font-black"><DoorOpen size={17} aria-hidden/>Por puerta</h2>
        <div className="mt-2 divide-y divide-[var(--border)]">{(gates ?? []).map((gate) => { const online = scanners.filter((scanner) => scanner.gateId === gate.id && scanner.presence === "online").length; return <div key={gate.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
          <span className="min-w-0"><b className="block truncate">{gate.name}</b><span className="text-xs text-neutral-500">{gate.active ? `${online} ${online === 1 ? "scanner en línea" : "scanners en línea"}` : "Desactivada"}</span></span>
          <b className="text-xl">{entriesByGate[gate.id] ?? 0}</b></div>; })}
          {!(gates ?? []).length && <p className="py-3 text-sm text-neutral-500">Todavía no hay puertas.</p>}</div></div>

      <div className="card p-5"><h2 className="flex items-center gap-2 font-black"><Smartphone size={17} aria-hidden/>Scanners</h2>
        <div className="mt-2 divide-y divide-[var(--border)]">{scanners.map((scanner) => <div key={scanner.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
          <span className="min-w-0"><b className="flex items-center gap-2"><span className={`size-2.5 shrink-0 rounded-full ${presenceDot[scanner.presence]}`} aria-hidden/><span className="truncate">{scanner.label}</span>{scanner.supervisor && <span className="rounded-full bg-[var(--surface-strong)] px-2 py-0.5 text-[10px] font-black uppercase text-neutral-500">Supervisor</span>}</b>
            <span className="text-xs text-neutral-500">{gateName.get(scanner.gateId) ?? "Sin puerta"}</span></span>
          <span className="shrink-0 text-right text-xs"><b className="block">{presenceLabels[scanner.presence]}</b><span className="text-neutral-500">{scanner.presence === "inactive" ? "esperando el PIN" : timeAgo(scanner.lastSeenAt, now)}</span></span></div>)}
          {!scanners.length && <p className="py-3 text-sm text-neutral-500">Todavía no hay scanners. Generá un PIN en Accesos.</p>}</div></div>
    </section>

    {boxOfficeOn && <section className="card mt-4 p-5" aria-label="Taquilla"><h2 className="flex items-center gap-2 font-black"><Store size={17} aria-hidden/>Taquilla</h2>
      <div className="mt-3 grid grid-cols-3 gap-3"><Mini label="Cajas abiertas" value={`${openRegisters.length} / ${(boxRegisters ?? []).length}`}/><Mini label="Entradas vendidas" value={String(boxTotals.tickets)}/><Mini label="Cobrado" value={formatMoney(boxTotals.gmv, event.currency)}/></div>
      {(boxRegisters ?? []).length > 0 && openRegisters.length === 0 && <p className="mt-3 text-xs text-amber-600">Ninguna caja está abierta ahora.</p>}</section>}

    <section className="card mt-4 p-5" aria-label="Últimos movimientos"><div className="flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 font-black"><ScanLine size={17} aria-hidden/>Últimos movimientos</h2><Link href={`/app/events/${event.id}/access` as never} className="text-xs font-bold text-neutral-500 underline">Ver todos</Link></div>
      <div className="mt-2 divide-y divide-[var(--border)]">{(recent ?? []).map((row) => <div key={row.checkin_id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
        <span className="min-w-0"><b className="block truncate">{row.holder_name ?? "Sin nombre"}</b><span className="text-xs text-neutral-500">{[row.ticket_type_name, row.gate_name, row.device_label].filter(Boolean).join(" · ")}</span></span>
        <span className="shrink-0 text-right text-xs"><b className={row.result === "valid" ? "text-emerald-600" : "text-red-500"}>{resultLabels[row.result] ?? row.result}</b><span className="block text-neutral-500">{time(row.scanned_at)}</span></span></div>)}
        {!(recent ?? []).length && <p className="py-3 text-sm text-neutral-500">Todavía no se escaneó ninguna entrada.</p>}</div></section>

    <section className="mt-6 flex flex-wrap gap-2" aria-label="Accesos rápidos">
      <Link href="/scan" target="_blank" className="btn btn-primary"><ScanLine size={16}/>Abrir scanner</Link>
      {boxOfficeOn && <Link href={`/app/events/${event.id}/box-office` as never} className="btn btn-secondary"><Store size={16}/>Taquilla</Link>}
      <Link href={`/app/events/${event.id}/access` as never} className="btn btn-secondary"><DoorOpen size={16}/>Puertas y dispositivos</Link>
      <a href={`/app/events/${event.id}/guests/export?formato=pdf`} className="btn btn-secondary"><FileText size={16}/>Lista de invitados (PDF)</a>
    </section>
  </>;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" | "bad" }) {
  return <div className={`card p-4 ${tone === "bad" ? "border-red-500/40" : tone === "warn" ? "border-amber-400/40" : ""}`}><p className="text-xs font-bold text-neutral-500">{label}</p><p className="mt-1 text-2xl font-black">{value}</p></div>;
}
function Mini({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-neutral-500">{label}</p><p className="mt-0.5 text-lg font-black">{value}</p></div>;
}
