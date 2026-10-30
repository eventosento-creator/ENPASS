import { redirect } from "next/navigation";
import { getCollaboratorEventIds, getCurrentOrganization } from "./queries";
import { isClubEnabled } from "@/modules/clubs/application/queries";

/** Las pantallas de eventos, clientes, reportes y marketing son de las organizaciones de eventos: un club vuelve a su inicio. */
export async function requireEventsSpace() {
  const organization = await getCurrentOrganization();
  // Quien colabora en un evento ajeno entra a ese evento aunque su propio espacio sea un club.
  if (organization && (await getCollaboratorEventIds()).length === 0 && (organization.role === "staff" || (await isClubEnabled(organization.id)))) redirect("/app/socios" as never);
}
