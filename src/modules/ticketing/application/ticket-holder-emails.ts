import "server-only";

import { createAdminClient } from "@/shared/database/admin";

export async function getValidTicketHolderEmails(eventId: string) {
  const admin = createAdminClient();
  const { data: ticketRows } = await admin.from("tickets").select("customer_id").eq("event_id", eventId).eq("status", "valid");
  const customerIds = [...new Set((ticketRows ?? []).map((row) => row.customer_id))];
  if (!customerIds.length) return [];
  const { data: customerRows } = await admin.from("customers").select("id, email").in("id", customerIds);
  return [...new Set((customerRows ?? []).map((row) => row.email))];
}
