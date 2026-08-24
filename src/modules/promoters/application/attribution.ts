import "server-only";

import { createAdminClient } from "@/shared/database/admin";
import { promoterLog } from "@/shared/lib/structured-log";
import { generateOpaqueToken, hashOpaqueToken } from "@/modules/ticketing/domain/credentials";
import { isOpaqueCredential } from "../domain/session";

export async function recordPromoterAttribution(eventSlug: string, promoterSlug: string, currentCredential?: string) {
  const rawCredential = isOpaqueCredential(currentCredential) ? currentCredential : generateOpaqueToken();
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("record_promoter_link_visit", {
    target_event_slug: eventSlug,
    target_promoter_slug: promoterSlug,
    target_session_hash: hashOpaqueToken(rawCredential),
    target_anonymous_session_id: crypto.randomUUID(),
  });
  const attribution = data?.[0];
  if (error || !attribution) {
    promoterLog("promoter.attribution.skipped", { eventSlug, promoterSlug, reason: error ? "lookup_failed" : "inactive_or_unknown" });
    return null;
  }
  promoterLog("promoter.attribution.created", {
    eventId: attribution.resolved_event_id,
    eventPromoterId: attribution.resolved_event_promoter_id,
  });
  return { rawCredential, attribution };
}

export async function getActivePromoterAttribution(eventId: string, sessionHash: string | null) {
  if (!sessionHash) return null;
  const { data, error } = await createAdminClient().rpc("get_active_promoter_attribution", {
    target_event: eventId,
    target_session_hash: sessionHash,
  });
  if (error) return null;
  return data?.[0] ?? null;
}
