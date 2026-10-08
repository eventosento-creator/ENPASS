import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentOrganization } from "@/modules/organizations/application/queries";
import { isClubEnabled, getDivisionDues, getMembershipDetail, getMembershipDues, getMembershipCategories, getMembershipDivisions, getAvailableDivisionsForMembership, getMembershipPlanId, listMembershipPlans } from "@/modules/clubs/application/queries";
import { membershipStatusLabels } from "@/modules/clubs/domain/club";
import { ClubPermissionArea } from "@/modules/clubs/ui/club-permission-area";
import { CLUB_ROLES } from "@/modules/clubs/domain/club-roles";
import { DuesList } from "@/modules/clubs/ui/dues-list";
import { NewDueForm } from "@/modules/clubs/ui/new-due-form";
import { MembershipStatusForm } from "@/modules/clubs/ui/membership-status-form";
import { PaymentHistory } from "@/modules/clubs/ui/payment-history";
import { MembershipPlanCard } from "@/modules/clubs/ui/membership-plan-card";
import { MembershipDivisionsCard } from "@/modules/clubs/ui/membership-divisions-card";

const statusTone: Record<string, string> = { active: "status-success", suspended: "status-danger", cancelled: "text-neutral-500" };

export default async function MemberDetailPage({ params }: { params: Promise<{ membershipId: string }> }) {
  const { membershipId } = await params;
  const org = await getCurrentOrganization();
  if (!org) redirect("/app/onboarding");
  if (!(await isClubEnabled(org.id))) redirect("/app");

  const membership = await getMembershipDetail(membershipId);
  if (!membership || membership.organizationId !== org.id) notFound();
  const [dues, categories, memberDivisions, availableDivisions, plans, planId] = await Promise.all([
    getMembershipDues(membershipId), getMembershipCategories(org.id),
    getMembershipDivisions(membershipId), getAvailableDivisionsForMembership(membershipId),
    listMembershipPlans(org.id), getMembershipPlanId(membershipId),
  ]);
  const divisionDues = await Promise.all(memberDivisions.map(async (division) => ({ name: division.divisionName, dues: await getDivisionDues(division.enrollmentId) })));
  const historyEntries = [
    ...dues.map((due) => ({ concept: "Cuota de socio", due })),
    ...divisionDues.flatMap(({ name, dues: list }) => list.map((due) => ({ concept: `División ${name}`, due }))),
  ];
  const category = categories.find((c) => c.id === membership.categoryId);

  return <>
    <Link href={"/app/socios" as never} className="inline-flex items-center gap-2 text-sm font-bold text-neutral-500 hover:text-white"><ArrowLeft size={16}/>Volver a Socios</Link>
    <div className="mt-7 flex flex-wrap items-start justify-between gap-4">
      <div><p className="eyebrow">Socio N° {membership.memberNumber}</p><h1 className="page-title mt-2">{membership.firstName} {membership.lastName}</h1><p className="mt-3 text-neutral-500">{membership.categoryName} · {membership.email}{membership.document ? ` · DNI ${membership.document}` : ""}{membership.phone ? ` · ${membership.phone}` : ""}</p></div>
      <span className={`rounded-full px-3 py-1.5 text-sm font-bold ${statusTone[membership.membershipStatus]}`}>{membershipStatusLabels[membership.membershipStatus]}</span>
    </div>
    {org.clubRole && <p className="mt-3 rounded-xl border border-[var(--border)] px-4 py-3 text-sm text-neutral-500">Tu cargo: <b>{CLUB_ROLES[org.clubRole].label}</b>. {CLUB_ROLES[org.clubRole].description}</p>}
    {membership.statusReason && <p className="mt-3 text-sm text-neutral-500">Motivo: {membership.statusReason}</p>}

    <ClubPermissionArea role={org.clubRole} permission="members" quiet><section className="card mt-6 p-5 sm:p-6">
      <h2 className="text-lg font-bold">Estado de la membresía</h2>
      <div className="mt-4"><MembershipStatusForm membershipId={membership.membershipId} currentStatus={membership.membershipStatus}/></div>
    </section></ClubPermissionArea>

    <ClubPermissionArea role={org.clubRole} permission="dues" quiet><MembershipPlanCard membershipId={membership.membershipId} currentPlanId={planId} plans={plans} categoryFee={category?.monthly_fee_amount ?? 0} categoryName={category?.name ?? "la categoría"} currency={org.default_currency}/></ClubPermissionArea>

    <ClubPermissionArea role={org.clubRole} permission="dues" quiet><section className="card mt-6 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">Cuotas</h2><NewDueForm membershipId={membership.membershipId} defaultAmount={category?.monthly_fee_amount ?? 0} startsAt={membership.startsAt}/></div>
      <div className="mt-5"><DuesList membershipId={membership.membershipId} dues={dues} currency={org.default_currency}/></div>
    </section></ClubPermissionArea>

    <PaymentHistory entries={historyEntries} currency={org.default_currency}/>

    <ClubPermissionArea role={org.clubRole} permission="members" quiet><MembershipDivisionsCard membershipId={membership.membershipId} divisions={memberDivisions} available={availableDivisions} currency={org.default_currency}/></ClubPermissionArea>
  </>;
}
