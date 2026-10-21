import { notFound } from "next/navigation";
import { Banknote, ShieldCheck } from "lucide-react";
import { createClient } from "@/shared/database/server";
import { createAdminClient } from "@/shared/database/admin";
import { getAllOrganizationsForAdmin, isPlatformAdmin } from "@/modules/organizations/application/queries";
import { reviewTransfer, savePlatformTransferDetails, setTicketTransfer } from "@/modules/payments/application/transfer-admin-actions";
import { formatMoney } from "@/shared/lib/format";
import { SubmitButton } from "@/shared/ui/submit-button";

const notices: Record<string, { text: string; tone: "ok" | "warn" }> = {
  approved: { text: "Transferencia aprobada: la orden quedó pagada y las entradas se envían al comprador.", tone: "ok" },
  rejected: { text: "Transferencia rechazada: se le avisó al comprador y puede reintentar.", tone: "ok" },
  conflict: { text: "Aprobada, pero la orden quedó marcada como conflicto (ya no había cupo). Es el único caso en que corresponde devolverle la plata al comprador (a mano): el error es de ENPASS, no del comprador.", tone: "warn" },
  already: { text: "Esa transferencia ya había sido revisada.", tone: "warn" },
  error: { text: "No se pudo completar la revisión. Probá de nuevo.", tone: "warn" },
  invalid: { text: "Datos inválidos.", tone: "warn" },
  details_saved: { text: "Datos bancarios guardados.", tone: "ok" },
  details_error: { text: "Revisá los datos: el alias lleva 6 a 20 letras o números, el CBU 22 dígitos y el CUIT 11.", tone: "warn" },
};

export default async function AdminTransfersPage({ searchParams }: { searchParams: Promise<{ r?: string; ver?: string }> }) {
  if (!(await isPlatformAdmin())) notFound();
  const query = await searchParams;
  const view = query.ver === "historial" ? "historial" : "pendientes";
  const supabase = await createClient();
  const [{ data: details }, { data: rows }, organizations, { data: enabledRows }] = await Promise.all([
    supabase.rpc("get_platform_transfer_details"),
    supabase.rpc("list_transfer_payments", { target_status: view === "pendientes" ? "processing" : "all", target_limit: 100 }),
    getAllOrganizationsForAdmin(),
    supabase.from("organizations").select("id, ticket_transfer_enabled"),
  ]);
  const bank = details?.[0];
  const enabledIds = new Set((enabledRows ?? []).filter((row) => row.ticket_transfer_enabled).map((row) => row.id));
  const transfers = (rows ?? []).filter((row) => view === "pendientes" || row.status !== "pending");
  // Los comprobantes son privados: se abren con un link firmado de 10 minutos.
  const admin = createAdminClient();
  const proofUrls = new Map<string, string>();
  await Promise.all(transfers.filter((row) => row.proof_path).map(async (row) => {
    const { data } = await admin.storage.from("transfer-proofs").createSignedUrl(row.proof_path!, 600);
    if (data?.signedUrl) proofUrls.set(row.payment_public_id, data.signedUrl);
  }));
  const notice = query.r ? notices[query.r] : null;

  return <>
    <header className="flex items-center gap-2"><ShieldCheck className="text-[var(--accent)]" size={22}/><h1 className="page-title">Transferencias</h1></header>
    <p className="mt-2 max-w-2xl text-sm text-neutral-500">Compras pagadas por transferencia a ENPASS. Compará cada comprobante con el extracto del banco antes de aprobar: al aprobar se emiten las entradas.</p>
    {notice && <p role="status" className={`mt-5 rounded-xl border p-4 text-sm ${notice.tone === "ok" ? "border-[var(--accent)]/20 bg-[var(--accent)]/[.06]" : "border-amber-400/30 bg-amber-400/[.08]"}`}>{notice.text}</p>}

    <nav className="mt-8 flex gap-2" aria-label="Vista">
      <a href="/admin/transferencias" className={`btn ${view === "pendientes" ? "btn-primary" : "btn-secondary"}`}>Para revisar</a>
      <a href="/admin/transferencias?ver=historial" className={`btn ${view === "historial" ? "btn-primary" : "btn-secondary"}`}>Historial</a>
    </nav>

    <div className="mt-5 grid gap-3">
      {transfers.map((row) => <div key={row.payment_public_id} className="card grid gap-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0"><p className="font-black">{row.event_name}</p><p className="text-xs text-neutral-500">{row.organization_name} · orden {row.order_public_id.slice(0, 8)}</p></div>
          <p className="text-lg font-black">{formatMoney(row.total_amount, row.currency)}</p>
        </div>
        <p className="text-sm">{row.buyer_name || "Sin nombre"} · {row.buyer_email}{row.buyer_document ? ` · DNI ${row.buyer_document}` : ""}</p>
        <p className="text-xs text-neutral-500">Comprobante subido {row.proof_uploaded_at ? new Date(row.proof_uploaded_at).toLocaleString("es-AR") : "—"} · estado: {statusLabel(row.status)}{row.rejection_reason ? ` (${row.rejection_reason})` : ""}</p>
        {proofUrls.get(row.payment_public_id) && <a className="btn btn-secondary w-fit" href={proofUrls.get(row.payment_public_id)} target="_blank" rel="noopener noreferrer">Ver comprobante</a>}
        {row.status === "processing" && <div className="flex flex-wrap items-end gap-2">
          <form action={reviewTransfer}><input type="hidden" name="paymentPublicId" value={row.payment_public_id}/><input type="hidden" name="approve" value="true"/><SubmitButton className="btn btn-primary" pendingLabel="Aprobando…">Aprobar y emitir entradas</SubmitButton></form>
          <form action={reviewTransfer} className="flex items-end gap-2"><input type="hidden" name="paymentPublicId" value={row.payment_public_id}/><input type="hidden" name="approve" value="false"/><input className="field" name="reason" placeholder="Motivo (se lo mostramos al comprador)" maxLength={300}/><SubmitButton className="btn btn-ghost text-red-400" pendingLabel="Rechazando…">Rechazar</SubmitButton></form>
        </div>}
      </div>)}
      {!transfers.length && <p className="text-sm text-neutral-500">{view === "pendientes" ? "No hay transferencias esperando revisión." : "Todavía no hay transferencias."}</p>}
    </div>

    <h2 className="mt-12 flex items-center gap-2 text-xl font-black"><Banknote size={20}/>Datos bancarios de ENPASS</h2>
    <p className="mt-2 max-w-2xl text-sm text-neutral-500">Es lo que ve el comprador para transferir. Hasta que cargues alias y CBU, la transferencia no se ofrece en ningún evento.</p>
    <form action={savePlatformTransferDetails} className="mt-4 grid max-w-2xl gap-3 sm:grid-cols-2">
      <label className="label">Alias<input className="field" name="alias" defaultValue={bank?.transfer_alias ?? ""} placeholder="enpass.cobros" maxLength={20}/></label>
      <label className="label">CBU (22 dígitos)<input className="field" name="cbu" defaultValue={bank?.transfer_cbu ?? ""} inputMode="numeric" maxLength={22}/></label>
      <label className="label">Titular<input className="field" name="holder" defaultValue={bank?.transfer_holder ?? ""} maxLength={120}/></label>
      <label className="label">CUIT<input className="field" name="cuit" defaultValue={bank?.transfer_cuit ?? ""} inputMode="numeric" maxLength={13}/></label>
      <label className="label sm:col-span-2">Banco<input className="field" name="bank" defaultValue={bank?.transfer_bank ?? ""} maxLength={80}/></label>
      <div className="sm:col-span-2"><SubmitButton className="btn btn-primary" pendingLabel="Guardando…">Guardar datos bancarios</SubmitButton></div>
    </form>

    <h2 className="mt-12 text-xl font-black">Productores que ofrecen transferencia</h2>
    <p className="mt-2 max-w-2xl text-sm text-neutral-500">Apagado por defecto. Al habilitarlo, el checkout de sus eventos suma la opción de transferencia; ENPASS recibe la plata y se la liquida después.</p>
    <div className="mt-4 grid max-w-2xl gap-2">
      {organizations.map((organization) => { const enabled = enabledIds.has(organization.id); return <form key={organization.id} action={setTicketTransfer} className="card flex items-center justify-between gap-3 p-3">
        <input type="hidden" name="organizationId" value={organization.id}/><input type="hidden" name="enabled" value={enabled ? "false" : "true"}/>
        <span className="min-w-0"><b className="block truncate">{organization.name}</b><span className="text-xs text-neutral-500">{enabled ? "Ofrece transferencia" : "Solo Mercado Pago"}</span></span>
        <SubmitButton className={`btn ${enabled ? "btn-ghost text-red-400" : "btn-secondary"}`} pendingLabel="…">{enabled ? "Desactivar" : "Activar"}</SubmitButton>
      </form>; })}
    </div>
  </>;
}

function statusLabel(status: string) {
  return ({ processing: "en revisión", approved: "aprobada", rejected: "rechazada", cancelled: "cancelada", pending: "sin comprobante" } as Record<string, string>)[status] ?? status;
}
