import "server-only";

import { getCurrentOrganization } from "@/modules/organizations/application/queries";
import type { EventCapabilities } from "../domain/event-profile";

export type EventViewerRole = "manager" | "collaborator";

export async function getEventViewerRole(organizationId: string): Promise<EventViewerRole> {
  const organization = await getCurrentOrganization();
  return organization && organization.id === organizationId ? "manager" : "collaborator";
}

/** V1: un colaborador de evento (sin membresía de organización) solo opera Entradas, Invitados, Mesas y Accesos. */
export function restrictCapabilitiesForCollaborator(capabilities: EventCapabilities): EventCapabilities {
  return { ...capabilities, promoters: false, seatmap: false, pos: false };
}
