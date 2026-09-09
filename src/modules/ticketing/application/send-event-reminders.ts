import "server-only";

import { createAdminClient } from "@/shared/database/admin";
import type { Event, Venue } from "@/shared/database/types";
import { ticketingLog } from "@/shared/lib/structured-log";
import type { EmailProvider } from "../infrastructure/email-provider";
import { SmtpEmailProvider } from "../infrastructure/smtp-email-provider";
import { createBuyerMagicLink } from "./buyer-access";
import { formatEventDateParts } from "./deliver-tickets";

export async function sendEventReminders(eventId: string, options: { provider?: EmailProvider } = {}) {
  const admin = createAdminClient();
  const { data: eventData } = await admin.from("events").select("*").eq("id", eventId).single();
  if (!eventData) throw new Error("EVENT_NOT_FOUND");
  const event = eventData as Event;
  const { data: venueData } = await admin.from("venues").select("*").eq("id", event.venue_id).single();
  if (!venueData) throw new Error("VENUE_NOT_FOUND");
  const venue = venueData as Venue;

  const { data: ticketRows } = await admin.from("tickets").select("customer_id").eq("event_id", eventId).eq("status", "valid");
  const customerIds = [...new Set((ticketRows ?? []).map((row) => row.customer_id))];
  if (!customerIds.length) return { sent: 0, failed: 0, total: 0 };

  const { data: customerRows } = await admin.from("customers").select("id, email").in("id", customerIds);
  const emails = [...new Set((customerRows ?? []).map((row) => row.email))];
  const { dateLabel, timeLabel } = formatEventDateParts(event.starts_at, venue.timezone);
  const provider = options.provider ?? new SmtpEmailProvider();

  let sent = 0;
  let failed = 0;
  for (const email of emails) {
    try {
      const accessUrl = await createBuyerMagicLink(email);
      if (!accessUrl) throw new Error("BUYER_ACCESS_CREATE_FAILED");
      await provider.sendEventReminder({
        to: email,
        eventName: event.name,
        eventDateLabel: dateLabel,
        eventTimeLabel: timeLabel,
        venueName: venue.name,
        venueAddress: venue.address,
        accessUrl,
      });
      sent += 1;
    } catch {
      failed += 1;
    }
  }
  ticketingLog("event.reminder.sent", { eventId, sent, failed, total: emails.length });
  await admin.from("events").update({ reminder_sent_at: new Date().toISOString() }).eq("id", eventId);
  return { sent, failed, total: emails.length };
}
