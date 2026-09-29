import { redirect } from "next/navigation";
import { getCurrentOrganization } from "@/modules/organizations/application/queries";
import { isClubEnabled, listDivisions } from "@/modules/clubs/application/queries";
import { ClubSectionNav } from "@/modules/clubs/ui/club-section-nav";
import { DivisionsManager } from "@/modules/clubs/ui/divisions-manager";

export default async function DivisionsPage() {
  const org = await getCurrentOrganization();
  if (!org) redirect("/app/onboarding");
  if (!(await isClubEnabled(org.id))) redirect("/app");

  const divisions = await listDivisions(org.id);

  return <>
    <div><p className="eyebrow">Tu club</p><h1 className="page-title mt-2">Divisiones</h1><p className="mt-3 text-neutral-500">Fútbol, básquet, natación — cada una con su propia cuota.</p></div>
    <ClubSectionNav active="divisiones"/>
    <DivisionsManager organizationId={org.id} divisions={divisions} currency={org.default_currency}/>
  </>;
}
