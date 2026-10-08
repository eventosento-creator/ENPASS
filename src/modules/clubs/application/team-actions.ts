"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/shared/database/server";
import { inviteClubStaff } from "./team";
import { CLUB_ROLE_ORDER, type ClubRole } from "../domain/club-roles";

export type TeamActionState = { error?: string; success?: string; acceptUrl?: string };

const roleSchema = z.enum(CLUB_ROLE_ORDER as [string, ...string[]]);
const inviteSchema = z.object({ organizationId: z.string().uuid(), email: z.email(), role: roleSchema });

export async function inviteClubCollaborator(_: TeamActionState, formData: FormData): Promise<TeamActionState> {
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Ingresá un email válido y elegí un rol." };
  try {
    const result = await inviteClubStaff(parsed.data.organizationId, parsed.data.email, parsed.data.role as ClubRole);
    revalidatePath("/app/socios/equipo");
    return result.emailSent
      ? { success: `Invitación enviada a ${parsed.data.email}. Si no le llega en unos minutos (revisá spam), mandale este link:`, acceptUrl: result.acceptUrl }
      : { error: "Creamos la invitación pero el mail no salió. Copiá el link y mandaselo a mano (por WhatsApp, por ejemplo):", acceptUrl: result.acceptUrl };
  } catch {
    return { error: "No pudimos crear la invitación. Solo el dueño o un admin puede invitar." };
  }
}

export async function removeClubCollaborator(formData: FormData) {
  const organizationId = String(formData.get("organizationId") ?? "");
  const id = String(formData.get("id") ?? "");
  const kind = String(formData.get("kind") ?? "");
  if (!organizationId || !id) return;
  const supabase = await createClient();
  if (kind === "invitation") await supabase.rpc("revoke_club_staff_invitation", { target_org: organizationId, target_invitation: id });
  else await supabase.rpc("remove_club_staff", { target_org: organizationId, target_user: id });
  revalidatePath("/app/socios/equipo");
}

export async function updateClubCollaboratorRole(formData: FormData) {
  const organizationId = String(formData.get("organizationId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const role = roleSchema.safeParse(formData.get("role"));
  if (!organizationId || !userId || !role.success) return;
  const supabase = await createClient();
  await supabase.rpc("set_club_staff_role", { target_org: organizationId, target_user: userId, target_role: role.data });
  revalidatePath("/app/socios/equipo");
}
