import { CheckCircle2, LogOut, ShieldAlert } from "lucide-react";
import { getMemberDues, getMemberPendingDues, getMemberProfile } from "../application/member-portal";
import { logoutMember, refreshMemberQr } from "../application/member-portal-actions";
import { MemberQrCard } from "./member-qr-card";
import { PayDueButton } from "./pay-due-button";
import { PaymentHistory } from "./payment-history";
import { formatMoney } from "@/shared/lib/format";

const periodLabel = (period: string) => new Date(`${period}T00:00:00`).toLocaleDateString("es-AR", { month: "long", year: "numeric" });

/** "Mi cuota": estado del socio, cuotas pendientes con pago online, QR de ingreso e historial. null si no hay sesión de socio. */
export async function MemberHub({ slug }: { slug: string }) {
  const profile = await getMemberProfile(slug);
  if (!profile) return null;
  const [dues, qr, pending] = await Promise.all([getMemberDues(slug), refreshMemberQr(slug), getMemberPendingDues(slug)]);
  const suspended = profile.member_status === "suspended";
  const debt = profile.overdue_count > 0;
  const blocked = suspended || (debt && profile.debt_blocks_entry);

  return <section id="mi-cuota" className="scroll-mt-24" aria-label="Mi cuota">
    <div className="card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Socio N° {profile.member_number}</p>
          <h2 className="mt-1 text-3xl font-black tracking-[-.03em]">{profile.first_name} {profile.last_name}</h2>
          <p className="mt-2 text-sm text-neutral-500">{profile.category_name}{profile.divisions.length ? ` · ${profile.divisions.join(", ")}` : ""}</p>
        </div>
        <form action={logoutMember}><input type="hidden" name="slug" value={slug}/><button className="btn btn-ghost" aria-label="Cerrar sesión"><LogOut size={16}/><span className="hidden sm:inline">Salir</span></button></form>
      </div>
      {suspended ? <p className="status-danger mt-4 flex items-center gap-2 rounded-xl p-3 text-sm font-bold"><ShieldAlert size={17}/>Tu membresía está suspendida. Hablá con el club.</p>
        : debt ? <p className="status-danger mt-4 flex items-start gap-2 rounded-xl p-3 text-sm font-bold"><ShieldAlert size={17} className="mt-0.5 shrink-0"/><span>Tenés {formatMoney(profile.overdue_amount, "ARS")} vencidos{profile.debt_blocks_entry ? ": no vas a poder ingresar hasta regularizarlo" : ""}.</span></p>
        : <p className="status-success mt-4 flex items-center gap-2 rounded-xl p-3 text-sm font-bold"><CheckCircle2 size={17}/>Estás al día</p>}

      {pending.length > 0 && <div className="mt-5">
        <h3 className="text-sm font-black uppercase tracking-[.1em] text-neutral-500">Cuotas a pagar</h3>
        <ul className="mt-3 grid gap-3">
          {pending.map((due) => <li key={`${due.kind}-${due.dueId}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-4">
            <div><p className="font-bold">{due.concept} · <span className="inline-block first-letter:uppercase">{periodLabel(due.period)}</span></p><p className={`mt-0.5 text-xs font-semibold ${due.overdue ? "text-red-500" : "text-neutral-500"}`}>{due.overdue ? "Vencida" : "Vence"} el {new Date(`${due.dueDate}T00:00:00`).toLocaleDateString("es-AR", { day: "numeric", month: "long" })}</p></div>
            <div className="flex items-center gap-4"><span className="text-lg font-black">{formatMoney(due.amount, "ARS")}</span><PayDueButton slug={slug} dueId={due.dueId}/></div>
          </li>)}
        </ul>
        <p className="mt-3 text-xs text-neutral-500">Pagás con Mercado Pago y la cuota se marca sola como pagada.</p>
      </div>}
    </div>

    {qr && <div className="mt-6"><MemberQrCard slug={slug} initialPayload={qr} blocked={blocked}/></div>}
    <PaymentHistory entries={dues} currency="ARS" description="Tus pagos: cuota del club y divisiones."/>
  </section>;
}
