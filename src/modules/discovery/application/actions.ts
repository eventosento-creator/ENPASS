"use server";

import { cookies } from "next/headers";
import { createAdminClient } from "@/shared/database/admin";
import { hashOpaqueToken } from "@/modules/ticketing/domain/credentials";
import { BUYER_SESSION_COOKIE } from "@/modules/ticketing/application/buyer-access";
import type { ActionState } from "@/modules/identity/application/actions";

export type FavoriteActionState = ActionState & { favorited?: boolean; requiresLogin?: boolean };

export async function toggleEventFavorite(_: FavoriteActionState, formData: FormData): Promise<FavoriteActionState> {
  const eventId = formData.get("eventId");
  if (typeof eventId !== "string") return { error: "Evento inválido." };
  const rawSession = (await cookies()).get(BUYER_SESSION_COOKIE)?.value;
  if (!rawSession) return { requiresLogin: true };
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("toggle_event_favorite", {
    target_event: eventId,
    target_session_hash: hashOpaqueToken(rawSession),
  });
  if (error?.message.includes("SESSION_REQUIRED")) return { requiresLogin: true };
  if (error) return { error: "No pudimos guardar el favorito." };
  return { favorited: Boolean(data) };
}
