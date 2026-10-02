import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCircle2, LogOut, ShieldAlert, Users2 } from "lucide-react";
import { getMemberDues, getMemberProfile, getPortalClub } from "@/modules/clubs/application/member-portal";
import { logoutMember, refreshMemberQr } from "@/modules/clubs/application/member-portal-actions";
import { MemberLoginForm } from "@/modules/clubs/ui/member-login-form";
import { MemberQrCard } from "@/modules/clubs/ui/member-qr-card";
import { PaymentHistory } from "@/modules/clubs/ui/payment-history";
import { formatMoney } from "@/shared/lib/format";

export const metadata: Metadata = { title: "Mi perfil de socio", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function MemberPortalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const club = await getPortalClub(slug);
  if (!club) notFound();
  const profile = await getMemberProfile(slug);
  const clubName = club.brandName ?? club.name;
  const header = <div className="flex items-center gap-3">
    {club.logoUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={club.logoUrl} alt={clubName} className="size-12 rounded-xl border border-white/[.08] bg-white object-contain p-1.5"/> : <div className="grid size-12 place-items-center rounded-xl bg-[var(--accent)] text-[var(--on-accent)]"><Users2 size={22}/></div>}
    <div><p className="eyebrow">Perfil de socio</p><h1 className="text-2xl font-black tracking-[-.02em]">{clubName}</h1></div>
  </div>;

  if (!profile) return <main className="container-shell max-w-md pb-16 pt-10">
    {header}
    <p className="mt-5 text-sm leading-6 text-neutral-500">Entrá con tu DNI o tu mail para ver tu estado, tus pagos y tu QR de ingreso al club.</p>
    <MemberLoginForm slug={slug}/>
  </main>;

  const [dues, qr] = await Promise.all([getMemberDues(slug), refreshMemberQr(slug)]);
  const suspended = profile.member_status === "suspended";
  const debt = profile.overdue_count > 0;
  const blocked = suspended || (debt && profile.debt_blocks_entry);

  return <main className="container-shell max-w-2xl pb-16 pt-10">
    <div className="flex items-start justify-between gap-4">
      {header}
      <form action={logoutMember}><input type="hidden" name="slug" value={slug}/><button className="btn btn-ghost" aria-label="Cerrar sesión"><LogOut size={16}/><span className="hidden sm:inline">Salir</span></button></form>
    </div>

    <section className="card mt-7 p-5 sm:p-6">
      <p className="eyebrow">Socio N° {profile.member_number}</p>
      <h2 className="mt-1 text-3xl font-black tracking-[-.03em]">{profile.first_name} {profile.last_name}</h2>
      <p className="mt-2 text-sm text-neutral-500">{profile.category_name}{profile.divisions.length ? ` · ${profile.divisions.join(", ")}` : ""}</p>
      {suspended ? <p className="status-danger mt-4 flex items-center gap-2 rounded-xl p-3 text-sm font-bold"><ShieldAlert size={17}/>Tu membresía está suspendida. Hablá con el club.</p>
        : debt ? <p className="status-danger mt-4 flex items-start gap-2 rounded-xl p-3 text-sm font-bold"><ShieldAlert size={17} className="mt-0.5 shrink-0"/><span>Tenés {formatMoney(profile.overdue_amount, "ARS")} vencidos{profile.debt_blocks_entry ? ": no vas a poder ingresar hasta regularizarlo" : ""}. Pagá en el club o con el link de cuota que te mandamos por mail.</span></p>
        : <p className="status-success mt-4 flex items-center gap-2 rounded-xl p-3 text-sm font-bold"><CheckCircle2 size={17}/>Estás al día</p>}
    </section>

    {qr && <section className="mt-6"><MemberQrCard slug={slug} initialPayload={qr} blocked={blocked}/></section>}

    <PaymentHistory entries={dues} currency="ARS" description="Tus pagos: cuota del club y divisiones."/>
  </main>;
}
