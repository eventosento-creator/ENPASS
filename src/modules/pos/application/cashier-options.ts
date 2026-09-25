import "server-only";

import { createAdminClient } from "@/shared/database/admin";
import type { createClient } from "@/shared/database/server";

// People who can be assigned as the cashier of a device: org owners/admins plus the event's box-office staff.
export async function getCashierOptions(supabase: Awaited<ReturnType<typeof createClient>>, eventId: string, organizationId: string) {
  const [{ data: staffRows }, { data: memberRows }] = await Promise.all([
    supabase.from("box_office_staff").select("user_id, role").eq("event_id", eventId),
    supabase.from("organization_members").select("user_id, role").eq("organization_id", organizationId),
  ]);
  const candidates = new Map<string, string>();
  for (const row of memberRows ?? []) candidates.set(row.user_id, row.role === "owner" ? "Dueño" : "Admin");
  for (const row of staffRows ?? []) if (!candidates.has(row.user_id)) candidates.set(row.user_id, row.role === "supervisor" ? "Supervisor" : "Cajero");
  const admin = createAdminClient();
  return Promise.all([...candidates].map(async ([id, role]) => {
    const { data } = await admin.auth.admin.getUserById(id);
    return { id, label: `${data?.user?.email ?? "Usuario"} (${role})` };
  }));
}
