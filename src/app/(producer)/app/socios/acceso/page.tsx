import { redirect } from "next/navigation";
import { DoorOpen } from "lucide-react";
import { getCurrentOrganization } from "@/modules/organizations/application/queries";
import { isClubEnabled } from "@/modules/clubs/application/queries";
import { revokeClubDoorDevice, setClubDebtBlocksEntry } from "@/modules/clubs/application/club-access-actions";
import { ClubBanner } from "@/modules/clubs/ui/club-banner";
import { ClubSectionNav } from "@/modules/clubs/ui/club-section-nav";
import { ClubDoorDeviceForm } from "@/modules/clubs/ui/club-door-device-form";
import { CopyLinkButton } from "@/modules/events/ui/copy-link-button";
import { createClient } from "@/shared/database/server";
import { SubmitButton } from "@/shared/ui/submit-button";

const resultLabels: Record<string, { label: string; tone: string }> = {
  allowed: { label: "Entró", tone: "status-success" },
  allowed_with_debt: { label: "Entró con deuda", tone: "text-amber-500" },
  denied_debt: { label: "Rechazado: deuda", tone: "status-danger" },
  denied_suspended: { label: "Rechazado: suspendido", tone: "status-danger" },
  denied_cancelled: { label: "Rechazado: de baja", tone: "status-danger" },
  invalid: { label: "QR inválido", tone: "text-neutral-500" },
};

export default async function ClubAccessPage() {
  const org = await getCurrentOrganization();
  if (!org) redirect("/app/onboarding");
  if (!(await isClubEnabled(org.id))) redirect("/app");
  if (!["owner", "admin"].includes(org.role)) redirect("/app/socios" as never);

  const supabase = await createClient();
  const [{ data: devices }, { data: log }, { data: settings }] = await Promise.all([
    supabase.from("club_door_devices").select("id, organization_id, name, code_expires_at, activation_count, activated_at, revoked_at, created_at").eq("organization_id", org.id).order("created_at", { ascending: false }),
    supabase.rpc("get_club_access_log", { target_org: org.id, target_limit: 30 }),
    supabase.from("club_settings").select("debt_blocks_entry").eq("organization_id", org.id).maybeSingle(),
  ]);
  const blocks = settings?.debt_blocks_entry ?? false;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://enpass.com.ar";
  const portalUrl = `${siteUrl}/mi-club/${org.slug}`;
  const doorUrl = `${siteUrl}/club-scan`;
  const activeDevices = (devices ?? []).filter((device) => !device.revoked_at);

  return <>
    <ClubBanner organizationId={org.id}/>
    <div><p className="eyebrow">Tu club</p><h1 className="page-title mt-2">Acceso</h1><p className="mt-3 text-neutral-500">Que entren solo los socios al día: cada socio tiene su QR personal y la puerta lo valida.</p></div>
    <ClubSectionNav active="acceso"/>

    <section className="card mt-6 p-5 sm:p-6">
      <h2 className="text-lg font-bold">Ingreso con deuda</h2>
      <p className="mt-1 text-sm text-neutral-500">{blocks ? "Los socios con cuotas vencidas son rechazados en la puerta." : "Los socios con cuotas vencidas entran, pero la puerta avisa que tienen deuda."} Los suspendidos y dados de baja siempre son rechazados.</p>
      <form action={setClubDebtBlocksEntry} className="mt-4"><input type="hidden" name="organizationId" value={org.id}/><input type="hidden" name="blocks" value={blocks ? "false" : "true"}/>
        <SubmitButton className={`btn ${blocks ? "btn-ghost" : "btn-primary"}`}>{blocks ? "Dejar de bloquear" : "Bloquear ingreso a socios con deuda"}</SubmitButton></form>
    </section>

    <section className="card mt-6 p-5 sm:p-6">
      <h2 className="text-lg font-bold">Perfil del socio</h2>
      <p className="mt-1 text-sm text-neutral-500">Pasale este link a tus socios: entran con su DNI o mail y su contraseña (la crean la primera vez desde ahí, les llega un mail) y ven su estado, sus pagos y su QR de ingreso.</p>
      <div className="mt-4 flex flex-wrap items-center gap-3"><code className="break-all rounded-lg bg-white/[.05] px-3 py-2 text-xs">{portalUrl}</code><CopyLinkButton value={portalUrl}/></div>
    </section>

    <section className="card mt-6 p-5 sm:p-6">
      <div className="flex items-center gap-2"><DoorOpen size={18}/><h2 className="text-lg font-bold">Puertas</h2></div>
      <p className="mt-1 text-sm text-neutral-500">Cada celu o tablet que escanea en la puerta se activa con un PIN. La página de la puerta es:</p>
      <div className="mt-3 flex flex-wrap items-center gap-3"><code className="break-all rounded-lg bg-white/[.05] px-3 py-2 text-xs">{doorUrl}</code><CopyLinkButton value={doorUrl}/></div>
      <div className="mt-5"><ClubDoorDeviceForm organizationId={org.id}/></div>
      {activeDevices.length > 0 && <div className="mt-5 grid gap-2">{activeDevices.map((device) => <div key={device.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[.08] p-3">
        <div><p className="text-sm font-bold">{device.name}</p><p className="text-xs text-neutral-500">{device.activation_count > 0 ? `Activada ${device.activation_count} ${device.activation_count === 1 ? "vez" : "veces"}` : new Date(device.code_expires_at) <= new Date() ? "PIN vencido sin usar" : "Esperando activación"}</p></div>
        <form action={revokeClubDoorDevice}><input type="hidden" name="deviceId" value={device.id}/><button className="btn btn-ghost text-red-400">Revocar</button></form>
      </div>)}</div>}
    </section>

    <section className="card mt-6 p-5 sm:p-6">
      <h2 className="text-lg font-bold">Últimos ingresos</h2>
      {log && log.length > 0 ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[30rem] text-left text-sm"><tbody>{log.map((entry, index) => {
        const info = resultLabels[entry.result] ?? { label: entry.result, tone: "" };
        return <tr key={index} className="border-b border-white/[.05]">
          <td className="py-2.5 pr-3 whitespace-nowrap text-xs text-neutral-500">{new Date(entry.created_at).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
          <td className="py-2.5 pr-3 font-semibold">{entry.member_name ?? "—"}{entry.member_number && <span className="ml-2 text-xs font-normal text-neutral-500">N° {entry.member_number}</span>}</td>
          <td className={`py-2.5 pr-3 text-xs font-bold ${info.tone}`}>{info.label}</td>
          <td className="py-2.5 text-xs text-neutral-500">{entry.device_name ?? ""}</td>
        </tr>; })}</tbody></table></div> : <p className="mt-3 text-sm text-neutral-500">Todavía no hubo ingresos registrados.</p>}
    </section>
  </>;
}
