import { redirect } from "next/navigation";
import { getCurrentOrganization } from "@/modules/organizations/application/queries";
import { isClubEnabled, getMembershipCategories } from "@/modules/clubs/application/queries";
import { ClubBanner } from "@/modules/clubs/ui/club-banner";
import { ClubSectionNav } from "@/modules/clubs/ui/club-section-nav";
import { CategoriesManager } from "@/modules/clubs/ui/categories-manager";

export default async function CategoriesPage() {
  const org = await getCurrentOrganization();
  if (!org) redirect("/app/onboarding");
  if (!(await isClubEnabled(org.id))) redirect("/app");

  const categories = await getMembershipCategories(org.id);

  return <>
    <ClubBanner organizationId={org.id}/>
    <div><p className="eyebrow">Tu club</p><h1 className="page-title mt-2">Categorías</h1><p className="mt-3 text-neutral-500">Los distintos tipos de socio y su cuota mensual.</p></div>
    <ClubSectionNav active="categorias"/>
    <CategoriesManager organizationId={org.id} categories={categories} currency={org.default_currency}/>
  </>;
}
