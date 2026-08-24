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

const selectionsSchema = z.array(z.object({ ticket_type_id: z.uuid(), quantity: z.number().int().positive().max(20) })).min(1);
export default async function CheckoutPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ selection?: string }> }) {
  const [{ slug }, query] = await Promise.all([params, searchParams]); let selections: z.infer<typeof selectionsSchema>;
  try { selections = selectionsSchema.parse(JSON.parse(query.selection ?? "[]")); } catch { redirect(`/e/${slug}`); }
  const supabase = await createClient(); const { data: event } = await supabase.from("events").select("*").eq("slug", slug).eq("status", "published").maybeSingle(); if (!event) notFound();
  const ids = selections.map(s => s.ticket_type_id); const { data: types } = await supabase.from("ticket_types").select("*").eq("event_id", event.id).in("id", ids).eq("active", true);
  if (!types || types.length !== new Set(ids).size) redirect(`/e/${slug}`);
  const subtotal = selections.reduce((sum, s) => sum + (types.find(t => t.id === s.ticket_type_id)?.price_amount ?? 0) * s.quantity, 0);
  const { data: organization, error: feePolicyError } = await createAdminClient().from("organizations").select("service_fee_bps, fee_payer").eq("id", event.organization_id).single();
  if (feePolicyError || !organization) throw new Error("CHECKOUT_FEE_POLICY_UNAVAILABLE");
  const serviceFee = organization?.fee_payer === "buyer" ? applyBasisPoints(subtotal, organization.service_fee_bps) : 0;
  const total = subtotal + serviceFee;
  return <main className="container-shell min-h-screen py-5 sm:py-12"><header className="flex items-center justify-between"><Link href={`/e/${slug}`} className="inline-flex min-h-11 items-center gap-1 text-sm text-neutral-500 hover:text-white"><ChevronLeft size={17}/>Cambiar entradas</Link><Link href="/" className="text-sm font-black tracking-[-.03em]">NIGHTLIFE OS</Link></header><div className="mx-auto mt-7 grid max-w-4xl gap-6 lg:grid-cols-[1fr_330px]"><section className="card p-5 sm:p-8"><p className="eyebrow">Checkout</p><h1 className="mt-3 text-3xl font-black tracking-[-.04em] sm:text-4xl">¿A quién enviamos las entradas?</h1><p className="mb-8 mt-3 text-sm leading-6 text-neutral-500">Pedimos solo lo necesario. Comprás como invitado, sin crear una cuenta.</p><CheckoutForm eventId={event.id} selections={selections} requireDocument={event.require_document}/></section><aside className="card order-first h-fit overflow-hidden lg:order-last"><EventCover src={event.cover_image_url} alt={`Flyer de ${event.name}`} className="aspect-[16/7]" sizes="(max-width: 1024px) 100vw, 330px"/><div className="p-5"><p className="text-[11px] font-black uppercase tracking-[.12em] text-neutral-600">Tu compra</p><h2 className="mt-2 font-bold">{event.name}</h2><div className="mt-4 grid gap-3 border-y border-white/[.07] py-4">{selections.map(s => { const type = types.find(t => t.id === s.ticket_type_id)!; return <div className="flex justify-between gap-4 text-sm" key={s.ticket_type_id}><span className="text-neutral-400">{s.quantity}× {type.name}</span><span className="shrink-0">{formatMoney(type.price_amount * s.quantity, event.currency)}</span></div>; })}</div><div className="mt-4 grid gap-2 text-sm"><SummaryRow label="Entradas" value={formatMoney(subtotal, event.currency)}/><SummaryRow label="Cargo de servicio" value={formatMoney(serviceFee, event.currency)}/><SummaryRow label="Total" value={formatMoney(total, event.currency)} strong/></div></div></aside></div></main>;
}

function SummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className={`flex items-baseline justify-between gap-4 ${strong ? "mt-2 border-t border-white/[.07] pt-4 text-lg font-black" : "text-neutral-400"}`}><span>{label}</span><span>{value}</span></div>;
}
