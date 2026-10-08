import "server-only";

import { createAdminClient } from "@/shared/database/admin";
import { collaboratorLog } from "@/shared/lib/structured-log";
import { SmtpEmailProvider } from "@/modules/ticketing/infrastructure/smtp-email-provider";

// Avisa a ENPASS (la persona que aprueba los clubes del listado público) cuando un club pide publicarse.
// Nunca rompe la acción del club: si el mail falla, queda registrado y la solicitud igual está en el panel de admin.
export async function notifyClubListingRequested(organizationId: string, description: string | null) {
  try {
    const admin = createAdminClient();
    const [{ data: organization }, { data: owner }] = await Promise.all([
      admin.from("organizations").select("name").eq("id", organizationId).maybeSingle(),
      admin.from("organization_members").select("user_id").eq("organization_id", organizationId).eq("role", "owner").limit(1).maybeSingle(),
    ]);
    const ownerEmail = owner ? (await admin.auth.admin.getUserById(owner.user_id)).data.user?.email ?? null : null;
    const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
    if (!appUrl) throw new Error("APP_URL_NOT_CONFIGURED");
    await new SmtpEmailProvider().sendClubListingRequest({
      to: process.env.PLATFORM_NOTIFY_EMAIL ?? "enpass.gf@gmail.com",
      clubName: organization?.name ?? "Un club",
      ownerEmail,
      description: description?.trim() || null,
      reviewUrl: new URL("/app/admin/clubs", appUrl).toString(),
    });
    collaboratorLog("club_listing.request.email_sent", { organizationId });
  } catch (error) {
    collaboratorLog("club_listing.request.email_failed", { organizationId, message: error instanceof Error ? error.message : String(error) });
  }
}
