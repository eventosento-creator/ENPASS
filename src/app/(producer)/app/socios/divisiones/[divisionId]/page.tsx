import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentOrganization } from "@/modules/organizations/application/queries";
import { isClubEnabled, getDivisionDetail, getDivisionEnrollments } from "@/modules/clubs/application/queries";
import { generateDivisionDuesForPeriod } from "@/modules/clubs/application/actions";
import { formatMoney } from "@/shared/lib/format";
import { EnrollMemberPicker } from "@/modules/clubs/ui/enroll-member-picker";
import { DivisionMemberRow } from "@/modules/clubs/ui/division-member-row";

function defaultCurrentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

export default async function DivisionDetailPage({ params }: { params: Promise<{ divisionId: string }> }) {
  const { divisionId } = await params;
  const org = await getCurrentOrganization();
  if (!org) redirect("/app/onboarding");
  if (!(await isClubEnabled(org.id))) redirect("/app");

  const division = await getDivisionDetail(divisionId);
  if (!division || division.organizationId !== org.id) notFound();
  const enrollments = await getDivisionEnrollments(divisionId);
  const currentPeriod = defaultCurrentPeriod();

  return <>
    <Link href={"/app/socios/divisiones" as never} className="inline-flex items-center gap-2 text-sm font-bold text-neutral-500 hover:text-white"><ArrowLeft size={16}/>Volver a Divisiones</Link>
    <div className="mt-7 flex flex-wrap items-start justify-between gap-4">
      <div><p className="eyebrow">División</p><h1 className="page-title mt-2">{division.name}</h1><p className="mt-3 text-neutral-500">{formatMoney(division.monthlyFeeAmount, org.default_currency)} / mes · {enrollments.length} {enrollments.length === 1 ? "socio anotado" : "socios anotados"}</p></div>
      <EnrollMemberPicker organizationId={org.id} divisionId={divisionId} alreadyEnrolledIds={enrollments.map((e) => e.membershipId)}/>
    </div>

    {enrollments.length > 0 && <form action={generateDivisionDuesForPeriod} className="card mt-6 flex flex-wrap items-end gap-3 p-4">
      <input type="hidden" name="divisionId" value={divisionId}/>
      <input type="hidden" name="period" value={currentPeriod}/>
      <p className="text-sm text-neutral-500">Generar la cuota de este mes para todos los socios anotados.</p>
      <button className="btn btn-secondary ml-auto" type="submit">Generar cuotas del mes</button>
    </form>}

    <div className="mt-6 grid gap-3">
      {enrollments.length ? enrollments.map((row) => <DivisionMemberRow key={row.enrollmentId} divisionId={divisionId} defaultAmount={division.monthlyFeeAmount} currency={org.default_currency} row={row}/>)
        : <p className="card py-10 text-center text-sm text-neutral-500">Todavía no hay socios anotados en esta división.</p>}
    </div>
  </>;
}
