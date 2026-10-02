import { NextResponse } from "next/server";
import { createAdminClient } from "@/shared/database/admin";
import { clearClubDoorCookie, getClubDoorSessionHash } from "@/modules/clubs/infrastructure/club-door-session";

export async function POST() {
  const hash = await getClubDoorSessionHash();
  if (hash) await createAdminClient().rpc("revoke_current_club_door_session", { target_session_hash: hash });
  await clearClubDoorCookie();
  return NextResponse.json({ ok: true });
}
