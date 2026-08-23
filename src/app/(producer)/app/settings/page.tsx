import Link from "next/link";
import { redirect } from "next/navigation";
import { CreditCard, ExternalLink, MapPin, ShieldCheck, Unplug } from "lucide-react";
import { getCurrentOrganization } from "@/modules/organizations/application/queries";
import { disconnectMercadoPago } from "@/modules/payments/application/actions";
import { assertPublicHttpsUrl, getMercadoPagoRuntimeConfig } from "@/modules/payments/infrastructure/config";
import { createClient } from "@/shared/database/server";
import { SubmitButton } from "@/shared/ui/submit-button";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ payment?: string }> }) {
  const organization = await getCurrentOrganization();
  if (!organization) redirect("/app/onboarding");
  const [{ payment: notice }, supabase] = await Promise.all([searchParams, createClient()]);
  const { data } = await supabase.rpc("get_payment_account_status", { target_organization: organization.id });
  const account = data?.[0];
  const environment = paymentEnvironment();
  const connected = account?.status === "connected" && !account.live_mode;

  return <div className="mx-auto max-w-4xl">
    <p className="eyebrow">Organización</p><h1 className="page-title mt-2">Configuración</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-500">Administrá los lugares y cómo recibís el dinero de tus ventas.</p>
    {notice && <Notice code={notice}/>}
    <section className="card mt-8 overflow-hidden">
      <div className="flex flex-col gap-5 border-b border-white/[.07] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7"><div className="flex gap-4"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--accent)] text-black"><CreditCard size={20}/></span><div><h2 className="text-xl font-black tracking-[-.025em]">Pagos</h2><p className="mt-1 text-sm text-neutral-500">Mercado Pago Marketplace · entorno de prueba</p></div></div><StatusBadge connected={connected} status={account?.status}/></div>
      <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[1fr_auto] lg:items-end"><div><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-[var(--accent)]" size={18}/><div><p className="text-sm font-bold">Conexión OAuth segura</p><p className="mt-1 max-w-xl text-sm leading-6 text-neutral-500">ENPASS nunca muestra tus credenciales. Los tokens se guardan cifrados y el estado de cada pago se valida desde el servidor.</p></div></div>{account?.expires_at && connected && <p className="mt-4 text-xs text-neutral-600">La credencial se renueva automáticamente antes de vencer.</p>}</div>
        {connected ? <form action={disconnectMercadoPago}><SubmitButton className="btn btn-ghost w-full lg:w-auto" pendingLabel="Desconectando…"><Unplug size={17}/>Desconectar</SubmitButton></form> : environment.ready ? <a className="btn btn-primary w-full lg:w-auto" href="/api/payments/mercadopago/connect">Conectar Mercado Pago <ExternalLink size={16}/></a> : <button className="btn btn-primary w-full lg:w-auto" disabled>Conectar Mercado Pago</button>}
      </div>
      {!environment.ready && <div className="border-t border-amber-300/10 bg-amber-300/[.04] p-5 text-sm leading-6 text-amber-100/70 sm:px-7"><strong className="text-amber-100">Configuración local incompleta.</strong> {environment.message}</div>}
    </section>
    <section className="card mt-4 flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7"><div className="flex gap-4"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/[.06]"><MapPin size={20}/></span><div><h2 className="font-bold">Lugares</h2><p className="mt-1 text-sm text-neutral-500">Direcciones, capacidad y zona horaria.</p></div></div><Link className="btn btn-secondary w-full sm:w-auto" href="/app/venues">Administrar lugares</Link></section>
  </div>;
}

function paymentEnvironment() {
  try { const config = getMercadoPagoRuntimeConfig(); assertPublicHttpsUrl(config.appUrl, "APP_URL"); assertPublicHttpsUrl(config.redirectUri, "MERCADO_PAGO_REDIRECT_URI"); return { ready: true, message: "" }; }
  catch { return { ready: false, message: "Agregá las variables sandbox y una URL HTTPS temporal de túnel en .env.local para habilitar OAuth y webhooks." }; }
}

function StatusBadge({ connected, status }: { connected: boolean; status?: string }) {
  const label = connected ? "Conectado" : status === "error" || status === "expired" ? "Requiere reconexión" : "No conectado";
  return <span className={`w-fit rounded-full border px-3 py-1.5 text-xs font-bold ${connected ? "border-lime-300/20 bg-lime-300/[.08] text-lime-200" : "border-white/[.08] text-neutral-500"}`}>{label}</span>;
}

function Notice({ code }: { code: string }) {
  const messages: Record<string, string> = { connected: "Mercado Pago quedó conectado en modo de prueba.", disconnected: "Mercado Pago fue desconectado.", cancelled: "Cancelaste la conexión antes de finalizar.", "invalid-state": "La solicitud de conexión venció. Volvé a intentarlo.", "connection-error": "No pudimos completar la conexión. Revisá las credenciales sandbox.", "config-error": "Falta completar la configuración local o el túnel HTTPS.", unauthorized: "Tu sesión venció. Iniciá sesión y volvé a intentarlo.", "disconnect-error": "No pudimos desconectar la cuenta." };
  return <div className="mt-6 rounded-xl border border-white/[.08] bg-white/[.035] p-4 text-sm text-neutral-300">{messages[code] ?? "Se actualizó la configuración de pagos."}</div>;
}
