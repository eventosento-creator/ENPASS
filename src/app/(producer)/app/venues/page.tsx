import { redirect } from "next/navigation";
import { getCurrentOrganization } from "@/modules/organizations/application/queries";
import { VenueManager } from "@/modules/organizations/ui/forms";
import { createClient } from "@/shared/database/server";

export default async function VenuesPage() {
  const org = await getCurrentOrganization(); if (!org) redirect("/app/onboarding");
  const supabase = await createClient(); const { data: venues } = await supabase.from("venues").select("*").eq("organization_id", org.id).order("name");
  return <VenueManager organizationId={org.id} venues={venues ?? []}/>;
}
