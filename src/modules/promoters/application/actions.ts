"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/shared/database/server";
import { commissionValueFromDisplay } from "../domain/commission";
import type { EventPromoterStatus } from "@/shared/database/types";
import { createPromoterInvitation, revokePromoterSession } from "./access";
import { clearPromoterSessionCookie, getPromoterSessionHash } from "../infrastructure/session";

export type PromoterActionState = {
  error?: string;
  success?: string;
  publicLink?: string;
  accessUrl?: string;
  emailSent?: boolean;
};

const promoterInputSchema = z.object({
  eventId: z.uuid(),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80).default(""),
  email: z.union([z.literal(""), z.email().max(320)]).default(""),
  phone: z.string().trim().max(40).default(""),
  instagram: z.string().trim().max(80).default(""),
  publicSlug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  commissionType: z.enum(["fixed_per_ticket", "percentage"]),
  commissionValue: z.coerce.number().positive().max(1_000_000),
});

export async function createEventPromoter(
  _: PromoterActionState,
  formData: FormData,
): Promise<PromoterActionState> {
  const parsed = promoterInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisá los datos, el slug y la comisión." };
  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("slug").eq("id", parsed.data.eventId).single();
  if (!event) return { error: "No encontramos ese evento." };

  let storedCommissionValue: number;
  try {
    storedCommissionValue = commissionValueFromDisplay(parsed.data.commissionType, parsed.data.commissionValue);
  } catch {
    return { error: "La comisión no es válida." };
  }

  const { data, error } = await supabase.rpc("create_event_promoter", {
    target_event: parsed.data.eventId,
    promoter_first_name: parsed.data.firstName,
    promoter_last_name: parsed.data.lastName,
    promoter_email: parsed.data.email,
    promoter_phone: parsed.data.phone,
    promoter_instagram: parsed.data.instagram,
    target_public_slug: parsed.data.publicSlug,
    target_commission_type: parsed.data.commissionType,
    target_commission_value: storedCommissionValue,
  });
  const relation = data?.[0];
  if (error || !relation) return { error: promoterCreateError(error?.message) };

  const invitation = await createPromoterInvitation(relation.event_promoter_id, Boolean(parsed.data.email));
  revalidatePath(`/app/events/${parsed.data.eventId}/promoters`);
  return {
    success: parsed.data.email && invitation.emailSent
      ? `${parsed.data.firstName} ya tiene su link. También enviamos el acceso por email.`
      : `${parsed.data.firstName} ya puede vender.`,
    publicLink: absoluteUrl(`/e/${event.slug}/${parsed.data.publicSlug}`),
    accessUrl: invitation.accessUrl,
    emailSent: invitation.emailSent,
  };
}

const updatePromoterSchema = promoterInputSchema.omit({ eventId: true, commissionType: true, commissionValue: true }).extend({
  eventId: z.uuid(),
  eventPromoterId: z.uuid(),
});

export async function updateEventPromoter(
  _: PromoterActionState,
  formData: FormData,
): Promise<PromoterActionState> {
  const parsed = updatePromoterSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisá los datos y el slug." };
  const { error } = await (await createClient()).rpc("update_event_promoter", {
    target_event_promoter: parsed.data.eventPromoterId,
    promoter_first_name: parsed.data.firstName,
    promoter_last_name: parsed.data.lastName,
    promoter_email: parsed.data.email,
    promoter_phone: parsed.data.phone,
    promoter_instagram: parsed.data.instagram,
    target_public_slug: parsed.data.publicSlug,
  });
  if (error) return { error: "No pudimos guardar los cambios. Revisá que el email y el slug no estén en uso." };
  revalidatePath(`/app/events/${parsed.data.eventId}/promoters`);
  revalidatePath(`/app/events/${parsed.data.eventId}/promoters/${parsed.data.eventPromoterId}`);
  return { success: "Cambios guardados." };
}

const commissionRuleSchema = z.object({
  eventId: z.uuid(),
  eventPromoterId: z.uuid(),
  ticketTypeId: z.union([z.literal(""), z.uuid()]).default(""),
  commissionType: z.enum(["fixed_per_ticket", "percentage"]),
  commissionValue: z.coerce.number().positive().max(1_000_000),
});

export async function upsertPromoterCommissionRule(
  _: PromoterActionState,
  formData: FormData,
): Promise<PromoterActionState> {
  const parsed = commissionRuleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisá el tipo y valor de comisión." };
  let storedValue: number;
  try {
    storedValue = commissionValueFromDisplay(parsed.data.commissionType, parsed.data.commissionValue);
  } catch {
    return { error: "La comisión no es válida." };
  }
  const { error } = await (await createClient()).rpc("upsert_promoter_commission_rule", {
    target_event_promoter: parsed.data.eventPromoterId,
    target_ticket_type: parsed.data.ticketTypeId || null,
    target_commission_type: parsed.data.commissionType,
    target_commission_value: storedValue,
  });
  if (error) return { error: "No pudimos actualizar la comisión." };
  revalidatePath(`/app/events/${parsed.data.eventId}/promoters`);
  revalidatePath(`/app/events/${parsed.data.eventId}/promoters/${parsed.data.eventPromoterId}`);
  return { success: "Comisión actualizada. Las ventas anteriores conservan su valor." };
}

export async function setEventPromoterStatus(formData: FormData) {
  const eventId = formData.get("eventId");
  const eventPromoterId = formData.get("eventPromoterId");
  const status = formData.get("status");
  if (typeof eventId !== "string" || typeof eventPromoterId !== "string" || !isEventPromoterStatus(status)) return;
  await (await createClient()).rpc("set_event_promoter_status", {
    target_event_promoter: eventPromoterId,
    target_status: status,
  });
  revalidatePath(`/app/events/${eventId}/promoters`);
  revalidatePath(`/app/events/${eventId}/promoters/${eventPromoterId}`);
}

export async function createNewPromoterInvitation(
  _: PromoterActionState,
  formData: FormData,
): Promise<PromoterActionState> {
  const eventPromoterId = formData.get("eventPromoterId");
  const eventId = formData.get("eventId");
  const sendEmail = formData.get("sendEmail") === "true";
  if (typeof eventPromoterId !== "string" || typeof eventId !== "string") return { error: "Invitación inválida." };
  try {
    const result = await createPromoterInvitation(eventPromoterId, sendEmail);
    revalidatePath(`/app/events/${eventId}/promoters/${eventPromoterId}`);
    return {
      success: result.emailSent ? "Invitación enviada." : "Nuevo acceso creado para copiar.",
      accessUrl: result.accessUrl,
      emailSent: result.emailSent,
    };
  } catch {
    return { error: "No pudimos crear la invitación." };
  }
}

export async function logoutPromoter() {
  const sessionHash = await getPromoterSessionHash();
  await revokePromoterSession(sessionHash);
  await clearPromoterSessionCookie();
  redirect("/promoter");
}

function promoterCreateError(message?: string) {
  if (message?.includes("event_promoters_event_id_public_slug_key")) return "Ese slug ya está en uso para este evento.";
  if (message?.includes("event_promoters_event_id_promoter_id_key")) return "Ese RRPP ya participa de este evento.";
  if (message?.includes("PROMOTER_INACTIVE")) return "Ese RRPP está desactivado en la organización.";
  return "No pudimos agregar el RRPP.";
}

function absoluteUrl(path: string) {
  return new URL(path, process.env.APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").toString();
}

function isEventPromoterStatus(value: FormDataEntryValue | null): value is EventPromoterStatus {
  return value === "active" || value === "inactive";
}
