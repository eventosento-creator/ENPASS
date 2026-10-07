import { redirect } from "next/navigation";
import { getCurrentOrganization } from "@/modules/organizations/application/queries";
import { getMembershipCategories, isClubEnabled, listDivisions } from "@/modules/clubs/application/queries";
import { ClubBanner } from "@/modules/clubs/ui/club-banner";
import { ClubSectionNav } from "@/modules/clubs/ui/club-section-nav";
import { DivisionsManager } from "@/modules/clubs/ui/divisions-manager";

export default async function DivisionsPage() {
  const org = await getCurrentOrganization();
  if (!org) redirect("/app/onboarding");
  if (!(await isClubEnabled(org.id))) redirect("/app");

  const [divisions, categories] = await Promise.all([listDivisions(org.id), getMembershipCategories(org.id)]);

  return <>
    <ClubBanner organizationId={org.id}/>
    <div><p className="eyebrow">Tu club</p><h1 className="page-title mt-2">Divisiones</h1><p className="mt-3 text-neutral-500">Fútbol, básquet, natación — cada una con su propia cuota.</p></div>
    <ClubSectionNav active="divisiones"/>
    <DivisionsManager organizationId={org.id} divisions={divisions} categories={categories.map((category) => ({ id: category.id, name: category.name }))} currency={org.default_currency}/>
  </>;
}
