import { redirect } from "next/navigation";
import { getCurrentOrganization } from "@/modules/organizations/application/queries";
import { isClubEnabled } from "@/modules/clubs/application/queries";
import { getClubTeam } from "@/modules/clubs/application/team";
import { ClubBanner } from "@/modules/clubs/ui/club-banner";
import { ClubSectionNav } from "@/modules/clubs/ui/club-section-nav";
import { ClubTeamCard } from "@/modules/clubs/ui/club-team-card";

export default async function ClubTeamPage() {
  const org = await getCurrentOrganization();
  if (!org) redirect("/app/onboarding");
  if (!(await isClubEnabled(org.id))) redirect("/app");
  if (!["owner", "admin"].includes(org.role)) redirect("/app/socios" as never);
  const team = await getClubTeam(org.id);
  return <>
    <ClubBanner organizationId={org.id}/>
    <div><p className="eyebrow">Tu club</p><h1 className="page-title mt-2">Equipo</h1><p className="mt-3 text-neutral-500">Quién te ayuda a gestionar el club.</p></div>
    <ClubSectionNav active="equipo"/>
    <section className="mt-6"><ClubTeamCard organizationId={org.id} team={team}/></section>
  </>;
}
