import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { z } from "zod";
import { createClient } from "@/shared/database/server";
import { formatMoney } from "@/shared/lib/format";
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
  return <main className="container-shell min-h-screen py-5 sm:py-12"><header className="flex items-center justify-between"><Link href={`/e/${slug}`} className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-white"><ChevronLeft size={17}/>Cambiar entradas</Link><span className="text-sm font-black tracking-[-.03em]">NIGHTLIFE OS</span></header><div className="mx-auto mt-7 grid max-w-4xl gap-6 lg:grid-cols-[1fr_330px]"><section className="card p-5 sm:p-8"><p className="eyebrow">Último paso</p><h1 className="mt-3 text-3xl font-black tracking-[-.04em] sm:text-4xl">Tus datos</h1><p className="mb-8 mt-3 text-sm leading-6 text-neutral-500">Solo necesitamos estos datos para enviarte tu entrada.</p><CheckoutForm eventId={event.id} selections={selections} requireDocument={event.require_document}/></section><aside className="card h-fit overflow-hidden lg:order-last"><EventCover src={event.cover_image_url} alt={`Flyer de ${event.name}`} className="aspect-[16/7]" sizes="(max-width: 1024px) 100vw, 330px"/><div className="p-5"><h2 className="font-bold">{event.name}</h2><div className="mt-4 grid gap-3 border-y border-white/[.07] py-4">{selections.map(s => { const type = types.find(t => t.id === s.ticket_type_id)!; return <div className="flex justify-between text-sm" key={s.ticket_type_id}><span className="text-neutral-400">{s.quantity}× {type.name}</span><span>{formatMoney(type.price_amount * s.quantity)}</span></div>; })}</div><div className="mt-4 flex justify-between font-black"><span>Subtotal</span><span>{formatMoney(subtotal)}</span></div><p className="mt-2 text-[11px] leading-5 text-neutral-600">El cargo de servicio se mostrará en el total de tu reserva.</p></div></aside></div></main>;
}
