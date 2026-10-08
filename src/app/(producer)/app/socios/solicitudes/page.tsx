import { ClubPermissionArea } from "@/modules/clubs/ui/club-permission-area";
import { redirect } from "next/navigation";
import { getCurrentOrganization } from "@/modules/organizations/application/queries";
import { getMembershipRequests, getNextMemberNumber, isClubEnabled } from "@/modules/clubs/application/queries";
import { ClubBanner } from "@/modules/clubs/ui/club-banner";
import { ClubSectionNav } from "@/modules/clubs/ui/club-section-nav";
import { MembershipRequestsManager } from "@/modules/clubs/ui/membership-requests-manager";

export default async function MembershipRequestsPage() {
  const org = await getCurrentOrganization();
  if (!org) redirect("/app/onboarding");
  if (!(await isClubEnabled(org.id))) redirect("/app");

  const [requests, suggestedNumber] = await Promise.all([getMembershipRequests(org.id), getNextMemberNumber(org.id)]);
  const pending = requests.filter((r) => r.status === "pending");
  const reviewed = requests.filter((r) => r.status !== "pending");

  return <>
    <ClubBanner organizationId={org.id}/>
    <div><p className="eyebrow">Tu club</p><h1 className="page-title mt-2">Solicitudes</h1><p className="mt-3 text-neutral-500">Gente que pidió ser socia desde la página pública del club. Vos decidís quién entra.</p></div>
    <ClubSectionNav active="solicitudes"/>
    <ClubPermissionArea role={org.clubRole} permission="members"><MembershipRequestsManager pending={pending} reviewed={reviewed} suggestedNumber={suggestedNumber}/></ClubPermissionArea>
  </>;
}
