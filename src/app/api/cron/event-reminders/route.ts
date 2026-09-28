import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/shared/database/admin";
import { sendEventReminders } from "@/modules/ticketing/application/send-event-reminders";
import { ticketingLog } from "@/shared/lib/structured-log";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = Date.now();
  // Runs once a day (Vercel Hobby plan cron limit), so the window covers
  // "starts sometime tomorrow" rather than a tight 24h mark.
  const windowStart = new Date(now + 12 * 3_600_000).toISOString();
  const windowEnd = new Date(now + 36 * 3_600_000).toISOString();
  const { data: events } = await admin.from("events").select("id")
    .eq("status", "published").is("reminder_sent_at", null)
    .gte("starts_at", windowStart).lte("starts_at", windowEnd);

  const results = [];
  for (const event of events ?? []) {
    try {
      const result = await sendEventReminders(event.id);
      results.push({ eventId: event.id, ...result });
    } catch (error) {
      ticketingLog("event.reminder.sent", { eventId: event.id, sent: 0, failed: -1, total: 0, errorCode: error instanceof Error ? error.message : "unknown" });
      results.push({ eventId: event.id, error: true });
    }
  }

  // Misma corrida diaria: pasa a "finished" los eventos publicados/agotados cuyo
  // horario de fin (o inicio, si no tienen fin cargado) pasó hace más de 8 horas.
  // Comparten cron por el límite de crons del plan Hobby de Vercel.
  const finishCutoff = new Date(now - 8 * 3_600_000).toISOString();
  const { data: dueEvents } = await admin.from("events").select("id, ends_at, starts_at")
    .in("status", ["published", "sold_out"]);
  const finishedIds = (dueEvents ?? [])
    .filter((event) => (event.ends_at ?? event.starts_at) <= finishCutoff)
    .map((event) => event.id);
  if (finishedIds.length > 0) {
    await admin.from("events").update({ status: "finished" }).in("id", finishedIds);
  }

  return NextResponse.json({ checked: events?.length ?? 0, results, finished: finishedIds.length });
}
