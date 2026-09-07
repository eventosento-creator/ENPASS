import { notFound } from "next/navigation";
import { createClient } from "@/shared/database/server";
import { EventSectionNav } from "@/modules/events/ui/event-section-nav";
import { DisabledEventModule } from "@/modules/events/ui/disabled-event-module";
import { getEventCapabilities } from "@/modules/events/domain/event-profile";
import { getPosModuleLabel } from "@/modules/pos/domain/pos";
import { EventPosManagement } from "@/modules/pos/ui/event-pos-management";

export default async function EventPosPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params; const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("*").eq("id", eventId).single();
  if (!event) notFound(); const capabilities = getEventCapabilities(event);
  if (!capabilities.pos) return <><EventSectionNav eventId={eventId} active="pos" capabilities={capabilities} profile={event.profile}/><DisabledEventModule eventId={eventId} eventName={event.name} moduleName={getPosModuleLabel(event.profile)}/></>;
  const [{ data: products }, { data: eventProducts }, { data: locations }, { data: locationProducts }, { data: devices }, { data: sessions }, { data: overviewData }, { data: locationMetrics }, { data: productMetrics }] = await Promise.all([
    supabase.from("products").select("id, name, category_id, default_price_amount, currency, active").eq("organization_id", event.organization_id).order("name"),
    supabase.from("event_products").select("id, product_id, price_amount, currency, enabled, sort_order").eq("event_id", eventId).order("sort_order"),
    supabase.from("sales_locations").select("id, name, description, active, sort_order").eq("event_id", eventId).order("sort_order"),
    supabase.from("sales_location_products").select("sales_location_id, event_product_id").eq("event_id", eventId),
    supabase.from("pos_device_authorizations").select("id, sales_location_id, name, status, code_expires_at, activated_at").eq("event_id", eventId).order("created_at", { ascending: false }),
    supabase.from("pos_sessions").select("id, sales_location_id, pos_device_id, status, operator_label, opening_cash_amount, closing_difference_amount, opened_at, closed_at").eq("event_id", eventId).order("opened_at", { ascending: false }),
    supabase.rpc("get_event_pos_overview", { target_event: eventId }),
    supabase.rpc("get_event_pos_location_metrics", { target_event: eventId }),
    supabase.rpc("get_event_pos_product_metrics", { target_event: eventId }),
  ]);
  const byLocation: Record<string, string[]> = {}; for (const item of locationProducts ?? []) (byLocation[item.sales_location_id] ??= []).push(item.event_product_id);
  const overview = overviewData?.[0] ?? { total_revenue: 0, sale_count: 0, cash_revenue: 0, card_revenue: 0, mercado_pago_revenue: 0, bank_transfer_revenue: 0, open_sessions: 0, currency: event.currency };
  return <><div><p className="eyebrow">{event.name}</p><h1 className="page-title mt-2">{getPosModuleLabel(event.profile)}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-500">Configurá productos, puntos de venta, dispositivos y cierres sin mezclar la operación con el checkout online.</p></div><EventSectionNav eventId={eventId} active="pos" capabilities={capabilities} profile={event.profile}/><EventPosManagement eventId={eventId} products={products ?? []} eventProducts={eventProducts ?? []} locations={locations ?? []} locationProductIds={byLocation} devices={devices ?? []} sessions={sessions ?? []} overview={overview} locationMetrics={locationMetrics ?? []} productMetrics={productMetrics ?? []}/></>;
}
