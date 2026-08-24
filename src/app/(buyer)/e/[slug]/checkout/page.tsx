import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { z } from "zod";
import { createClient } from "@/shared/database/server";
import { createAdminClient } from "@/shared/database/admin";
import { formatMoney } from "@/shared/lib/format";
import { applyBasisPoints } from "@/modules/payments/domain/fees";
import { CheckoutForm } from "@/modules/orders/ui/checkout-form";
import { EventCover } from "@/modules/events/ui/event-cover";
import { checkoutSelectionSchema } from "@/modules/orders/domain/checkout";
import type { PublicEventTable } from "@/modules/orders/ui/table-selector";

const selectionsSchema = z.array(checkoutSelectionSchema).min(1).max(20);
type Selection = z.infer<typeof checkoutSelectionSchema>;
type CheckoutItem = { id: string; itemType: "ticket" | "table"; name: string; quantity: number; unitPrice: number; serviceFeeBps: number };

export default async function CheckoutPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ selection?: string }> }) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  let selections: Selection[];
  try { selections = selectionsSchema.parse(JSON.parse(query.selection ?? "[]")); } catch { redirect(`/e/${slug}`); }
  if (new Set(selections.map((selection) => `${selection.item_type}:${selection.item_id}`)).size !== selections.length) redirect(`/e/${slug}`);

  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("*").eq("slug", slug).eq("status", "published").maybeSingle();
  if (!event) notFound();
  const [{ data: publicTypes }, { data: publicTables }, { data: organization, error: feePolicyError }] = await Promise.all([
    supabase.rpc("get_public_ticket_types", { target_event: event.id }),
    supabase.rpc("get_public_event_tables", { target_event: event.id }),
    createAdminClient().from("organizations").select("service_fee_bps, fee_payer").eq("id", event.organization_id).single(),
  ]);
  if (feePolicyError || !organization) throw new Error("CHECKOUT_FEE_POLICY_UNAVAILABLE");
  const tables = (publicTables ?? []) as PublicEventTable[];
  const ticketById = new Map((publicTypes ?? []).map((type) => [type.id, type]));
  const tableById = new Map(tables.map((table) => [table.id, table]));
  const items = selections.flatMap((selection): CheckoutItem[] => {
    if (selection.item_type === "ticket") {
      const type = ticketById.get(selection.item_id);
      if (!type?.sale_open || type.available_quantity < selection.quantity || selection.quantity > type.max_per_order) return [];
      return [{ id: type.id, itemType: "ticket", name: type.name, quantity: selection.quantity, unitPrice: type.price_amount, serviceFeeBps: organization.service_fee_bps }];
    }
    const table = tableById.get(selection.item_id);
    if (!table || table.availability_status !== "available") return [];
    return [{ id: table.id, itemType: "table", name: table.name, quantity: 1, unitPrice: table.base_price_amount, serviceFeeBps: table.service_fee_bps }];
  });
  if (items.length !== selections.length) redirect(`/e/${slug}`);

  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const serviceFee = organization.fee_payer === "buyer" ? items.reduce((sum, item) => sum + applyBasisPoints(item.unitPrice * item.quantity, item.serviceFeeBps), 0) : 0;
  const total = subtotal + serviceFee;
  const hasTables = items.some((item) => item.itemType === "table");
  return <main className="container-shell min-h-screen py-5 sm:py-12"><header className="flex items-center justify-between"><Link href={`/e/${slug}`} className="inline-flex min-h-11 items-center gap-1 text-sm text-neutral-500 hover:text-white"><ChevronLeft size={17}/>Cambiar selección</Link><Link href="/" className="text-sm font-black tracking-[-.03em]">NIGHTLIFE OS</Link></header><div className="mx-auto mt-7 grid max-w-4xl gap-6 lg:grid-cols-[1fr_330px]"><section className="card p-5 sm:p-8"><p className="eyebrow">Checkout</p><h1 className="mt-3 text-3xl font-black tracking-[-.04em] sm:text-4xl">¿A quién enviamos los accesos?</h1><p className="mb-8 mt-3 text-sm leading-6 text-neutral-500">Pedimos solo lo necesario. Comprás como invitado, sin crear una cuenta.</p><CheckoutForm eventId={event.id} selections={selections} requireDocument={event.require_document} free={total === 0}/></section><aside className="card order-first h-fit overflow-hidden lg:order-last"><EventCover src={event.cover_image_url} alt={`Flyer de ${event.name}`} className="aspect-[16/7]" sizes="(max-width: 1024px) 100vw, 330px"/><div className="p-5"><p className="text-[11px] font-black uppercase tracking-[.12em] text-neutral-600">Tu compra</p><h2 className="mt-2 font-bold">{event.name}</h2><div className="mt-4 grid gap-3 border-y border-white/[.07] py-4">{items.map((item) => <div className="flex justify-between gap-4 text-sm" key={`${item.itemType}-${item.id}`}><span className="text-neutral-400">{item.quantity}× {item.name}</span><span className="shrink-0">{item.unitPrice === 0 ? "Gratis" : formatMoney(item.unitPrice * item.quantity, event.currency)}</span></div>)}</div><div className="mt-4 grid gap-2 text-sm"><SummaryRow label={hasTables ? "Subtotal" : "Entradas"} value={subtotal === 0 ? "Gratis" : formatMoney(subtotal, event.currency)}/>{total > 0 && <SummaryRow label="Cargo de servicio" value={formatMoney(serviceFee, event.currency)}/>}<SummaryRow label="Total" value={total === 0 ? "Gratis" : formatMoney(total, event.currency)} strong/></div></div></aside></div></main>;
}

function SummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className={`flex items-baseline justify-between gap-4 ${strong ? "mt-2 border-t border-white/[.07] pt-4 text-lg font-black" : "text-neutral-400"}`}><span>{label}</span><span>{value}</span></div>;
}
