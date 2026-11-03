import { redirect } from "next/navigation";
import { getActivePanel, getCollaboratorEventIds, getCurrentOrganization } from "./queries";

/** Las pantallas de eventos, clientes, reportes y marketing son del panel de eventos: desde el panel de club se vuelve al inicio del club. */
export async function requireEventsSpace() {
  const organization = await getCurrentOrganization();
  // Quien colabora en un evento ajeno entra a ese evento aunque su propio espacio sea un club.
  if (organization && (await getCollaboratorEventIds()).length === 0 && (organization.role === "staff" || (await getActivePanel()) === "club")) redirect("/app/socios" as never);
}

/** Las pantallas del club son del panel de club: desde el panel de eventos se vuelve al inicio de eventos. */
export async function requireClubPanel() {
  if ((await getActivePanel()) === "events") redirect("/app");
}
