"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/shared/database/server";
import { isPlatformAdmin } from "@/modules/organizations/application/queries";
import { EXPENSE_CATEGORIES, monthFirstDay, parseMonth, pesosToCents, shiftMonth } from "../domain/finance";

const categories = EXPENSE_CATEGORIES.map((category) => category.value) as [string, ...string[]];
const concept = z.string().trim().min(1).max(120);
const money = z.string().transform((text) => pesosToCents(text)).refine((cents): cents is number => cents !== null);
const lastDayOf = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);

/** Cada acción vuelve a la misma pantalla y mes; si algo no valida, vuelve con ?error= en vez de perder lo escrito sin avisar. */
async function guard(formData: FormData) {
  const month = parseMonth(String(formData.get("mes") ?? ""));
  const back = (error?: string) => redirect(`/admin/gastos?mes=${month}${error ? `&error=${error}` : ""}` as never);
  if (!(await isPlatformAdmin())) redirect("/admin" as never);
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return { month, back, supabase, userId: data.user?.id ?? null };
}
const done = (back: (error?: string) => never) => { revalidatePath("/admin/gastos"); return back(); };

export async function addExpense(formData: FormData) {
  const { month, back, supabase, userId } = await guard(formData);
  const parsed = z.object({ concept, category: z.enum(categories), amount: money, date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), kind: z.enum(["fijo", "variable"]) })
    .safeParse({ concept: formData.get("concept"), category: formData.get("category"), amount: String(formData.get("amount") ?? ""), date: formData.get("date"), kind: formData.get("kind") });
  if (!parsed.success) return back("gasto");
  const { error } = await supabase.from("platform_expenses").insert({ expense_date: parsed.data.date, concept: parsed.data.concept, category: parsed.data.category, amount_cents: parsed.data.amount, kind: parsed.data.kind, created_by: userId });
  if (error) return back("guardar");
  return done(back);
}

export async function deleteExpense(formData: FormData) {
  const { back, supabase } = await guard(formData);
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return back("guardar");
  const { error } = await supabase.from("platform_expenses").delete().eq("id", id.data);
  if (error) return back("guardar");
  return done(back);
}

/** Gasto fijo nuevo: rige desde el mes que se está mirando. */
export async function addRecurringExpense(formData: FormData) {
  const { month, back, supabase, userId } = await guard(formData);
  const parsed = z.object({ concept, category: z.enum(categories), amount: money })
    .safeParse({ concept: formData.get("concept"), category: formData.get("category"), amount: String(formData.get("amount") ?? "") });
  if (!parsed.success) return back("fijo");
  const { error } = await supabase.from("platform_recurring_expenses").insert({ concept: parsed.data.concept, category: parsed.data.category, amount_cents: parsed.data.amount, starts_on: monthFirstDay(month), created_by: userId });
  if (error) return back("guardar");
  return done(back);
}

/** Cambia el monto desde el mes que se está mirando: cierra el gasto anterior y abre uno nuevo, así los meses pasados no se mueven. */
export async function changeRecurringAmount(formData: FormData) {
  const { month, back, supabase, userId } = await guard(formData);
  const parsed = z.object({ id: z.string().uuid(), amount: money }).safeParse({ id: formData.get("id"), amount: String(formData.get("amount") ?? "") });
  if (!parsed.success) return back("monto");
  const { data: current } = await supabase.from("platform_recurring_expenses").select("*").eq("id", parsed.data.id).maybeSingle();
  if (!current) return back("guardar");
  if (current.starts_on >= monthFirstDay(month)) {
    // Empezó este mes (o después): no hay historial que cuidar, se corrige el monto directo.
    const { error } = await supabase.from("platform_recurring_expenses").update({ amount_cents: parsed.data.amount }).eq("id", current.id);
    if (error) return back("guardar");
    return done(back);
  }
  const { error: closeError } = await supabase.from("platform_recurring_expenses").update({ ends_on: lastDayOf(shiftMonth(month, -1)) }).eq("id", current.id);
  if (closeError) return back("guardar");
  const { error } = await supabase.from("platform_recurring_expenses").insert({ concept: current.concept, category: current.category, amount_cents: parsed.data.amount, starts_on: monthFirstDay(month), ends_on: current.ends_on, created_by: userId });
  if (error) return back("guardar");
  return done(back);
}

/** Da de baja desde el mes que se está mirando (ese mes ya no cuenta); los anteriores quedan como estaban. */
export async function endRecurringExpense(formData: FormData) {
  const { month, back, supabase } = await guard(formData);
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return back("guardar");
  const { data: current } = await supabase.from("platform_recurring_expenses").select("starts_on").eq("id", id.data).maybeSingle();
  if (!current) return back("guardar");
  const { error } = current.starts_on >= monthFirstDay(month)
    ? await supabase.from("platform_recurring_expenses").delete().eq("id", id.data)
    : await supabase.from("platform_recurring_expenses").update({ ends_on: lastDayOf(shiftMonth(month, -1)) }).eq("id", id.data);
  if (error) return back("guardar");
  return done(back);
}
