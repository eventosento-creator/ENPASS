import { redirect } from "next/navigation";
import { getCurrentOrganization } from "@/modules/organizations/application/queries";
import { getClubBranding, getClubListingSettings, getClubPayoutDetails, isClubEnabled } from "@/modules/clubs/application/queries";
import { ClubBanner } from "@/modules/clubs/ui/club-banner";
import { ClubBrandingForm } from "@/modules/clubs/ui/club-branding-form";
import { ClubPayoutDetailsForm } from "@/modules/clubs/ui/club-payout-details-form";
import { ClubPublicListingForm } from "@/modules/clubs/ui/club-public-listing-form";
import { ClubSectionNav } from "@/modules/clubs/ui/club-section-nav";
import { ChangeClubLinkForm } from "@/modules/organizations/ui/change-club-link-form";
import { RenameOrganizationForm } from "@/modules/organizations/ui/rename-organization-form";

export default async function ClubSettingsPage() {
  const org = await getCurrentOrganization();
  if (!org) redirect("/app/onboarding");
  if (!(await isClubEnabled(org.id))) redirect("/app");
  if (!["owner", "admin"].includes(org.role)) redirect("/app/socios" as never);
  const [branding, listing, payoutDetails] = await Promise.all([getClubBranding(org.id), getClubListingSettings(org.id), getClubPayoutDetails(org.id)]);

  return <>
    <ClubBanner organizationId={org.id}/>
    <div><p className="eyebrow">Tu club</p><h1 className="page-title mt-2">Ajustes del club</h1><p className="mt-3 text-neutral-500">Nombre, identidad y publicación de tu club.</p></div>
    <ClubSectionNav active="ajustes"/>
    <section className="card mt-6 p-5 sm:p-7"><h2 className="mb-4 text-lg font-black">Nombre del espacio</h2><RenameOrganizationForm organizationId={org.id} name={org.name}/></section>
    <section className="card mt-4 p-5 sm:p-7"><h2 className="mb-4 text-lg font-black">Link del club</h2><ChangeClubLinkForm organizationId={org.id} slug={org.slug}/></section>
    <section className="card mt-4 p-5 sm:p-7"><h2 className="mb-4 text-lg font-black">Identidad del club</h2><ClubBrandingForm organizationId={org.id} logoUrl={branding.logoUrl} name={branding.name} accentColor={branding.accentColor} coverUrl={branding.coverUrl} coverFocus={branding.coverFocus} location={branding.location} activity={branding.activity}/></section>
    <section className="card mt-4 p-5 sm:p-7"><h2 className="mb-4 text-lg font-black">Datos para recibir las cuotas</h2><ClubPayoutDetailsForm organizationId={org.id} details={payoutDetails}/></section>
    <section className="card mt-4 p-5 sm:p-7"><ClubPublicListingForm organizationId={org.id} settings={listing}/></section>
  </>;
}
