"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/shared/database/server";
import { getCurrentOrganization } from "@/modules/organizations/application/queries";
import { localToIso, promotionFormSchema, promotionRpcError, toCentavos } from "../domain/promotions";

export type PromotionActionState = { error?: string };

export async function savePromotion(_: PromotionActionState, formData: FormData): Promise<PromotionActionState> {
  const raw = {
    ...Object.fromEntries(formData),
    eventIds: formData.getAll("eventIds").map(String),
    ticketTypeIds: formData.getAll("ticketTypeIds").map(String),
  };
  const parsed = promotionFormSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revisá los datos del formulario." };
  const data = parsed.data;
  const organization = await getCurrentOrganization();
  if (!organization || organization.id !== data.organizationId) return { error: "No tenés permiso para hacer esto." };

  // Cada tipo guarda solo su valor; el resto queda vacío.
  if (data.kind === "percent" && data.percent === undefined) return { error: "Ingresá el porcentaje de descuento." };
  if (data.kind === "fixed" && data.fixedPesos === undefined) return { error: "Ingresá el monto del descuento." };
  if (data.kind === "special_price" && data.specialPesos === undefined) return { error: "Ingresá el precio especial." };
  if (data.kind === "free" && data.maxTicketsBenefited === undefined) return { error: "El 100% necesita un máximo de entradas por compra." };
  const startsAt = localToIso(data.startsAt);
  const endsAt = localToIso(data.endsAt);
  if (startsAt && endsAt && endsAt <= startsAt) return { error: "La fecha de fin tiene que ser posterior a la de inicio." };

  const allEvents = data.allEvents === "on";
  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("upsert_promotion", {
    target_org: data.organizationId, target_id: data.id ?? null, target_name: data.name, target_code: data.code, target_description: data.description || null,
    target_kind: data.kind, target_percent_bps: data.kind === "percent" && data.percent !== undefined ? Math.round(data.percent * 100) : null,
    target_fixed_amount: data.kind === "fixed" ? toCentavos(data.fixedPesos) : null,
    target_special_price_amount: data.kind === "special_price" ? toCentavos(data.specialPesos) : null,
    target_active: data.active === "on", target_all_events: allEvents, target_event_ids: allEvents ? [] : data.eventIds, target_ticket_type_ids: data.ticketTypeIds,
    target_starts_at: startsAt, target_ends_at: endsAt, target_max_total_uses: data.maxTotalUses ?? null, target_max_uses_per_buyer: data.maxUsesPerBuyer ?? null,
    target_max_tickets_benefited: data.maxTicketsBenefited ?? null, target_min_tickets: data.minTickets ?? 1, target_max_discount_amount: toCentavos(data.maxDiscountPesos),
  });
  if (error || !id) return { error: promotionRpcError(error?.message) };
  revalidatePath("/app/marketing/cupones");
  redirect(`/app/marketing/cupones/${id}` as never);
}

export async function togglePromotionActive(formData: FormData) {
  const organization = await getCurrentOrganization();
  const id = String(formData.get("id") ?? "");
  if (!organization || !id) return;
  const supabase = await createClient();
  await supabase.rpc("set_promotion_active", { target_org: organization.id, target_id: id, target_active: formData.get("active") === "true" });
  revalidatePath("/app/marketing/cupones");
}

export async function duplicatePromotion(formData: FormData) {
  const organization = await getCurrentOrganization();
  const id = String(formData.get("id") ?? "");
  if (!organization || !id) return;
  const supabase = await createClient();
  const { data: copyId } = await supabase.rpc("duplicate_promotion", { target_org: organization.id, target_id: id });
  revalidatePath("/app/marketing/cupones");
  if (copyId) redirect(`/app/marketing/cupones/${copyId}/editar` as never);
}
