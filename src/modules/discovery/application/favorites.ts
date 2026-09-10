import "server-only";

import { cookies } from "next/headers";
import { createAdminClient } from "@/shared/database/admin";
import { hashOpaqueToken } from "@/modules/ticketing/domain/credentials";
import { BUYER_SESSION_COOKIE } from "@/modules/ticketing/application/buyer-access";

export async function getFavoritedEventIds(): Promise<string[]> {
  const rawSession = (await cookies()).get(BUYER_SESSION_COOKIE)?.value;
  if (!rawSession) return [];
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_favorited_event_ids", { target_session_hash: hashOpaqueToken(rawSession) });
  if (error) return [];
  return data ?? [];
}
