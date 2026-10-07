"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/shared/database/server";
import { inviteClubStaff } from "./team";

export type TeamActionState = { error?: string; success?: string; acceptUrl?: string };

const inviteSchema = z.object({ organizationId: z.string().uuid(), email: z.email() });

export async function inviteClubCollaborator(_: TeamActionState, formData: FormData): Promise<TeamActionState> {
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Ingresá un email válido." };
  try {
    const result = await inviteClubStaff(parsed.data.organizationId, parsed.data.email);
    revalidatePath("/app/socios/equipo");
    return result.emailSent
      ? { success: `Invitación enviada a ${parsed.data.email}.`, acceptUrl: result.acceptUrl }
      : { error: "Creamos la invitación pero no pudimos enviar el email. Copiá el link y mandaselo a mano:", acceptUrl: result.acceptUrl };
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
