import { notFound } from "next/navigation";
import { Armchair } from "lucide-react";
import { createClient } from "@/shared/database/server";
import { EventSectionNav } from "@/modules/events/ui/event-section-nav";
import { TableManagement } from "@/modules/tables/ui/table-management";

export default async function EventTablesPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const supabase = await createClient();
  const [{ data: event }, { data: zones }, { data: tables }, { data: benefits }, { data: holds }, { data: gates }] = await Promise.all([
    supabase.from("events").select("id, name, status").eq("id", eventId).single(),
    supabase.from("table_zones").select("*").eq("event_id", eventId).order("sort_order"),
    supabase.from("event_tables").select("*").eq("event_id", eventId).order("sort_order"),
    supabase.from("table_entitlement_templates").select("*").eq("event_id", eventId).order("sort_order"),
    supabase.from("table_holds").select("event_table_id, status, expires_at").eq("event_id", eventId).in("status", ["active", "consumed", "refund_review"]),
    supabase.from("access_gates").select("*").eq("event_id", eventId).eq("active", true).order("name"),
  ]);
  if (!event) notFound();
  const now = new Date().getTime();
  const managedTables = (tables ?? []).map((table) => {
    const tableHolds = (holds ?? []).filter((hold) => hold.event_table_id === table.id);
    const availability = tableHolds.some((hold) => hold.status === "consumed" || hold.status === "refund_review") ? "sold" as const
      : tableHolds.some((hold) => hold.status === "active" && new Date(hold.expires_at).getTime() > now) ? "held" as const : "available" as const;
    return { ...table, availability_status: availability, benefits: (benefits ?? []).filter((benefit) => benefit.event_table_id === table.id) };
  });
  return <><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">{event.name}</p><h1 className="mt-2 flex items-center gap-3 text-4xl font-black tracking-[-.05em]"><Armchair className="text-[var(--accent)]"/>Mesas</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-500">Inventario físico, reserva exclusiva y un único QR grupal por mesa.</p></div></div><EventSectionNav eventId={eventId} active="tables"/><section className="mt-7"><TableManagement eventId={eventId} zones={zones ?? []} tables={managedTables} gates={gates ?? []} editable={event.status === "draft" || event.status === "published"}/></section></>;
}
