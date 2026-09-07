import { notFound } from "next/navigation";
import { Grid3x3 } from "lucide-react";
import { createClient } from "@/shared/database/server";
import { EventSectionNav } from "@/modules/events/ui/event-section-nav";
import { SeatMapManagement } from "@/modules/seatmap/ui/seat-map-management";
import { getEventCapabilities } from "@/modules/events/domain/event-profile";
import { DisabledEventModule } from "@/modules/events/ui/disabled-event-module";

export default async function EventSeatMapPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const supabase = await createClient();
  const [{ data: event }, { data: sections }, { data: seats }, { data: holds }] = await Promise.all([
    supabase.from("events").select("*").eq("id", eventId).single(),
    supabase.from("seat_map_sections").select("*").eq("event_id", eventId).order("sort_order"),
    supabase.from("event_seats").select("*").eq("event_id", eventId).order("row_label"),
    supabase.from("seat_holds").select("event_seat_id, status, expires_at").eq("event_id", eventId).in("status", ["active", "consumed", "refund_review"]),
  ]);
  if (!event) notFound();
  const capabilities = getEventCapabilities(event);
  if (!capabilities.seatmap) return <DisabledEventModule eventId={event.id} eventName={event.name} moduleName="Asientos"/>;
  const now = new Date().getTime();
  const managedSeats = (seats ?? []).map((seat) => {
    const seatHolds = (holds ?? []).filter((hold) => hold.event_seat_id === seat.id);
    const availability = seatHolds.some((hold) => hold.status === "consumed" || hold.status === "refund_review") ? "sold" as const
      : seatHolds.some((hold) => hold.status === "active" && new Date(hold.expires_at).getTime() > now) ? "held" as const : "available" as const;
    return { ...seat, availability_status: availability };
  });
  return <><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">{event.name}</p><h1 className="mt-2 flex items-center gap-3 text-4xl font-black tracking-[-.05em]"><Grid3x3 className="text-[var(--accent)]"/>Asientos</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-500">Mapa de asientos numerados: cada comprador elige su ubicación exacta.</p></div></div><EventSectionNav eventId={eventId} active="seatmap" capabilities={capabilities}/><section className="mt-7"><SeatMapManagement eventId={eventId} sections={sections ?? []} seats={managedSeats} editable={event.status === "draft" || event.status === "published"}/></section></>;
}
