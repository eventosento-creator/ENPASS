import "server-only";

import { createAdminClient } from "@/shared/database/admin";
import type { Event, Venue } from "@/shared/database/types";
import { ticketingLog } from "@/shared/lib/structured-log";
import type { EmailProvider } from "../infrastructure/email-provider";
import { SmtpEmailProvider } from "../infrastructure/smtp-email-provider";
import { createBuyerMagicLink } from "./buyer-access";
import { formatEventDateParts } from "./deliver-tickets";
import { getValidTicketHolderEmails } from "./ticket-holder-emails";

export async function notifyEventChange(eventId: string, changedFields: string[], options: { provider?: EmailProvider } = {}) {
  if (!changedFields.length) return { sent: 0, failed: 0, total: 0 };
  const admin = createAdminClient();
  const { data: eventData } = await admin.from("events").select("*").eq("id", eventId).single();
  if (!eventData) throw new Error("EVENT_NOT_FOUND");
  const event = eventData as Event;
  const { data: venueData } = await admin.from("venues").select("*").eq("id", event.venue_id).single();
  if (!venueData) throw new Error("VENUE_NOT_FOUND");
  const venue = venueData as Venue;

  const emails = await getValidTicketHolderEmails(eventId);
  if (!emails.length) return { sent: 0, failed: 0, total: 0 };
  const { dateLabel, timeLabel } = formatEventDateParts(event.starts_at, venue.timezone);
  const provider = options.provider ?? new SmtpEmailProvider();

  let sent = 0;
  let failed = 0;
  for (const email of emails) {
    try {
      const accessUrl = await createBuyerMagicLink(email);
      if (!accessUrl) throw new Error("BUYER_ACCESS_CREATE_FAILED");
      await provider.sendEventChangeNotice({
        to: email,
        eventName: event.name,
        eventDateLabel: dateLabel,
        eventTimeLabel: timeLabel,
        venueName: venue.name,
        venueAddress: venue.address,
        changedFields,
        accessUrl,
      });
      sent += 1;
    } catch {
      failed += 1;
    }
  }
  ticketingLog("event.change.notified", { eventId, sent, failed, total: emails.length, changedFields: changedFields.join(",") });
  return { sent, failed, total: emails.length };
}
