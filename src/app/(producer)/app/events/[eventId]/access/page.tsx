import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Clock3, DoorOpen, KeyRound, ShieldAlert, Smartphone, UsersRound, XCircle } from "lucide-react";
import { createClient } from "@/shared/database/server";
import { AccessMonitor } from "@/modules/access/ui/access-monitor";
import { CreateGateForm, DeviceAuthorizationForm, GateEditor } from "@/modules/access/ui/access-management";
import { revokeScannerAuthorization, revokeScannerSession } from "@/modules/access/application/actions";
import type { CheckInResult } from "@/shared/database/types";
import { EventSectionNav } from "@/modules/events/ui/event-section-nav";

export default async function EventAccessPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const supabase = await createClient();
  const [eventResult, ticketTypesResult, gatesResult, rulesResult, authorizationsResult, sessionsResult, metricsResult, recentResult, checkinsResult] = await Promise.all([
    supabase.from("events").select("*").eq("id", eventId).single(),
    supabase.from("ticket_types").select("*").eq("event_id", eventId).order("sort_order"),
    supabase.from("access_gates").select("*").eq("event_id", eventId).order("created_at"),
    supabase.from("access_gate_ticket_types").select("*").eq("event_id", eventId),
    supabase.from("scanner_device_authorizations").select("id, organization_id, event_id, access_gate_id, label, permission, code_expires_at, session_expires_at, activation_count, activated_at, revoked_at, created_by, created_at, updated_at").eq("event_id", eventId).order("created_at", { ascending: false }),
    supabase.from("scanner_sessions").select("id, authorization_id, organization_id, event_id, access_gate_id, permission, expires_at, last_seen_at, revoked_at, created_at").eq("event_id", eventId).order("created_at", { ascending: false }),
    supabase.rpc("get_event_access_metrics", { target_event: eventId }),
    supabase.rpc("get_event_recent_checkins", { target_event: eventId, result_limit: 30 }),
    supabase.from("checkins").select("access_gate_id").eq("event_id", eventId).eq("result", "valid"),
  ]);
  const event = eventResult.data;
  if (!event) notFound();
  const { data: venue } = await supabase.from("venues").select("name, timezone").eq("id", event.venue_id).single();
  if (!venue) notFound();
  const gates = gatesResult.data ?? [];
  const rules = rulesResult.data ?? [];
  const authorizations = authorizationsResult.data ?? [];
  const sessions = sessionsResult.data ?? [];
  const metrics = metricsResult.data?.[0] ?? { entries_today: 0, valid_scans_today: 0, duplicate_scans_today: 0, rejected_scans_today: 0, active_devices: 0 };
  const gateNames = new Map(gates.map((gate) => [gate.id, gate.name]));
  const entriesByGate = (checkinsResult.data ?? []).reduce<Record<string, number>>((total, checkin) => checkin.access_gate_id ? { ...total, [checkin.access_gate_id]: (total[checkin.access_gate_id] ?? 0) + 1 } : total, {});
  const currentTime = new Date().getTime();
  const activeThreshold = currentTime - 2 * 60 * 1000;
  const activeDevicesByGate = sessions.reduce<Record<string, number>>((total, session) => !session.revoked_at && new Date(session.expires_at).getTime() > currentTime && new Date(session.last_seen_at).getTime() >= activeThreshold ? { ...total, [session.access_gate_id]: (total[session.access_gate_id] ?? 0) + 1 } : total, {});

  return <>
    <header className="flex flex-wrap items-end justify-between gap-5">
      <div><Link href={`/app/events/${event.id}`} className="inline-flex items-center gap-2 text-sm font-bold text-neutral-500 hover:text-white"><ArrowLeft size={16}/>Volver al evento</Link><p className="eyebrow mt-7">Control de acceso</p><h1 className="page-title mt-3">{event.name}</h1><p className="mt-3 text-sm text-neutral-500">{venue.name} · operación en vivo</p></div>
      <div className="flex flex-wrap items-center gap-3"><AccessMonitor/><Link className="btn btn-primary" href="/scan" target="_blank"><Smartphone size={17}/>Abrir scanner</Link></div>
    </header>
    <EventSectionNav eventId={event.id} active="access"/>

    <section className="mt-8 grid grid-cols-2 gap-3 xl:grid-cols-5">
      <Metric icon={<UsersRound/>} label="Ingresos hoy" value={metrics.entries_today}/>
      <Metric icon={<CheckCircle2/>} label="Lecturas válidas" value={metrics.valid_scans_today}/>
      <Metric icon={<Clock3/>} label="Ya utilizadas" value={metrics.duplicate_scans_today}/>
      <Metric icon={<XCircle/>} label="Rechazadas" value={metrics.rejected_scans_today}/>
      <Metric icon={<Smartphone/>} label="Dispositivos activos" value={metrics.active_devices}/>
    </section>

    <section className="mt-12"><div><p className="eyebrow">Puertas y reglas</p><h2 className="section-title mt-2">Por dónde entra cada ticket</h2></div><div className="mt-5 grid items-start gap-4 lg:grid-cols-2">{gates.map((gate) => <GateEditor gate={gate} rules={rules} ticketTypes={ticketTypesResult.data ?? []} entries={entriesByGate[gate.id] ?? 0} activeDevices={activeDevicesByGate[gate.id] ?? 0} key={gate.id}/>) }<CreateGateForm eventId={event.id} ticketTypes={ticketTypesResult.data ?? []}/></div></section>

    <section className="mt-12 grid items-start gap-5 xl:grid-cols-[420px_1fr]">
      <DeviceAuthorizationForm eventId={event.id} gates={gates}/>
      <div><p className="eyebrow">Dispositivos</p><h2 className="section-title mt-2">Autorizaciones y sesiones</h2><div className="mt-4 grid gap-3">{authorizations.length ? authorizations.map((authorization) => {
        const linkedSessions = sessions.filter((session) => session.authorization_id === authorization.id);
        const status = authorization.revoked_at ? "Revocada" : authorization.activation_count ? "Activada" : new Date(authorization.code_expires_at) <= new Date() ? "PIN vencido" : "Esperando activación";
        return <article className="card p-5" key={authorization.id}><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><KeyRound size={16} className="text-[var(--accent)]"/><p className="font-black">{authorization.label}</p><span className="rounded-full bg-white/[.06] px-2 py-1 text-[10px] font-black uppercase text-neutral-400">{authorization.permission === "supervisor" ? "Supervisor" : "Scanner"}</span></div><p className="mt-2 text-xs text-neutral-500">{gateNames.get(authorization.access_gate_id)} · {status}</p></div>{!authorization.revoked_at && <form action={revokeScannerAuthorization}><input type="hidden" name="eventId" value={event.id}/><input type="hidden" name="authorizationId" value={authorization.id}/><button className="btn btn-danger min-h-9 px-3 py-2 text-xs">Revocar</button></form>}</div>{linkedSessions.map((session) => <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[.06] bg-black/20 p-3" key={session.id}><div><p className="text-xs font-bold text-neutral-300">Sesión {session.revoked_at ? "revocada" : new Date(session.expires_at) <= new Date() ? "vencida" : "activa"}</p><p className="mt-1 text-[11px] text-neutral-600">Última señal: {formatDate(session.last_seen_at, venue.timezone)}</p></div>{!session.revoked_at && <form action={revokeScannerSession}><input type="hidden" name="eventId" value={event.id}/><input type="hidden" name="sessionId" value={session.id}/><button className="btn btn-danger min-h-9 px-3 py-2 text-xs">Cerrar sesión</button></form>}</div>)}</article>;
      }) : <Empty icon={<Smartphone/>} title="Todavía no hay dispositivos" detail="Generá un PIN para autorizar el primer scanner."/>}</div></div>
    </section>

    <section className="mt-12"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">Actividad</p><h2 className="section-title mt-2">Últimos ingresos</h2></div><p className="text-xs text-neutral-600">Horarios en {venue.timezone}</p></div>{recentResult.data?.length ? <div className="card mt-4 overflow-hidden"><div className="divide-y divide-white/[.06]">{recentResult.data.map((entry) => <article className="grid gap-3 p-4 sm:grid-cols-[140px_1fr_auto] sm:items-center" key={entry.checkin_id}><div><ResultBadge result={entry.result}/><p className="mt-2 text-xs text-neutral-600">{formatDate(entry.scanned_at, venue.timezone)}</p></div><div><p className="text-sm font-black">{entry.holder_name ?? resultLabel(entry.result)}</p><p className="mt-1 text-xs text-neutral-500">{entry.ticket_type_name ?? "Sin datos de ticket"}{entry.short_code ? ` · ${entry.short_code}` : ""}</p></div><div className="text-left sm:text-right"><p className="text-xs font-bold text-neutral-400">{entry.gate_name ?? "Sin puerta"}</p><p className="mt-1 text-[11px] text-neutral-600">{entry.device_label ?? "Sesión desconocida"}{entry.override ? " · excepción" : ""}</p></div></article>)}</div></div> : <div className="mt-4"><Empty icon={<DoorOpen/>} title="La puerta todavía está en silencio" detail="Las validaciones aparecerán acá en pocos segundos."/></div>}</section>
  </>;
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) { return <div className="card p-4"><span className="text-[var(--accent)] [&>svg]:size-4">{icon}</span><p className="mt-5 text-3xl font-black">{value}</p><p className="mt-1 text-xs font-bold text-neutral-500">{label}</p></div>; }
function Empty({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) { return <div className="card p-8 text-center"><span className="mx-auto block w-fit text-neutral-700 [&>svg]:size-7">{icon}</span><p className="mt-4 font-black">{title}</p><p className="mt-2 text-sm text-neutral-500">{detail}</p></div>; }
function formatDate(value: string, timeZone: string) { return new Intl.DateTimeFormat("es-AR", { timeZone, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(value)); }
function resultLabel(result: CheckInResult) { const labels: Record<CheckInResult, string> = { valid: "Ingreso válido", already_used: "Entrada ya utilizada", invalid: "Lectura inválida", wrong_event: "Otro evento", wrong_gate: "Puerta incorrecta", too_early: "Demasiado temprano", too_late: "Fuera de horario", cancelled: "Entrada cancelada", refunded: "Entrada reembolsada", expired: "Entrada expirada", device_not_authorized: "Dispositivo no autorizado", rate_limited: "Lecturas pausadas" }; return labels[result]; }
function ResultBadge({ result }: { result: CheckInResult }) { const positive = result === "valid"; const warning = result === "too_early" || result === "too_late" || result === "rate_limited"; return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${positive ? "bg-lime-400/10 text-lime-300" : warning ? "bg-amber-400/10 text-amber-300" : "bg-red-400/10 text-red-300"}`}>{positive ? <CheckCircle2 size={12}/> : warning ? <ShieldAlert size={12}/> : <XCircle size={12}/>} {resultLabel(result)}</span>; }
