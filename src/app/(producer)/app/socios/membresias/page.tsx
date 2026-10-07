import { redirect } from "next/navigation";
import { getCurrentOrganization } from "@/modules/organizations/application/queries";
import { isClubEnabled, listMembershipPlans } from "@/modules/clubs/application/queries";
import { ClubBanner } from "@/modules/clubs/ui/club-banner";
import { ClubSectionNav } from "@/modules/clubs/ui/club-section-nav";
import { PlansManager } from "@/modules/clubs/ui/plans-manager";

export default async function MembershipPlansPage() {
  const org = await getCurrentOrganization();
  if (!org) redirect("/app/onboarding");
  if (!(await isClubEnabled(org.id))) redirect("/app");
  const plans = await listMembershipPlans(org.id);
  return <>
    <ClubBanner organizationId={org.id}/>
    <div><p className="eyebrow">Tu club</p><h1 className="page-title mt-2">Membresías</h1><p className="mt-3 text-neutral-500">Planes de cobro: cuota estándar, planes familiares y becados.</p></div>
    <ClubSectionNav active="membresias"/>
    <PlansManager organizationId={org.id} plans={plans} currency={org.default_currency}/>
  </>;
}
