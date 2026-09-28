"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/shared/database/server";
import { createDueCheckout } from "./create-due-checkout";
import type { CustomerCandidate } from "../domain/club";

export type CustomerSearchState = { results: CustomerCandidate[]; error?: string };

export async function searchCustomersForClub(_: CustomerSearchState, formData: FormData): Promise<CustomerSearchState> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const query = String(formData.get("query") ?? "");
  if (!organizationId) return { results: [] };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_customers_for_club", { target_org: organizationId, target_query: query });
  if (error || !data) return { results: [], error: "No pudimos buscar." };
  return {
    results: data.map((row) => ({
      customerId: row.customer_id, firstName: row.first_name, lastName: row.last_name,
      email: row.email, phone: row.phone, document: row.document, alreadyMember: row.already_member,
    })),
  };
}

export type ClubActionState = { error?: string; success?: string };
export type DueCheckoutState = { error?: string; checkoutUrl?: string };

export async function createDueCheckoutLink(_: DueCheckoutState, formData: FormData): Promise<DueCheckoutState> {
  const dueId = String(formData.get("dueId") ?? "");
  if (!dueId) return { error: "Falta la cuota." };
  try {
    const { checkoutUrl } = await createDueCheckout(dueId);
    return { checkoutUrl };
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "PAYMENT_ACCOUNT_NOT_CONNECTED") return { error: "Conectá Mercado Pago en Ajustes antes de cobrar cuotas online." };
    if (code === "DUE_ALREADY_PAID") return { error: "Esa cuota ya está pagada." };
    return { error: "No pudimos generar el link de pago." };
  }
}

export async function toggleClubEnabled(formData: FormData) {
  const organizationId = String(formData.get("organizationId") ?? "");
  const enabled = formData.get("enabled") === "true";
  if (!organizationId) return;
  const supabase = await createClient();
  await supabase.rpc("set_club_enabled", { target_org: organizationId, target_enabled: enabled });
  revalidatePath("/app/settings");
  revalidatePath("/app");
}

const createMembershipSchema = z.object({
  organizationId: z.string().uuid(),
  categoryId: z.string().uuid(),
  memberNumber: z.string().min(1).max(20),
  customerId: z.string().uuid().optional(),
  firstName: z.string().max(80).optional(),
  lastName: z.string().max(80).optional(),
  email: z.string().max(160).optional(),
  phone: z.string().max(30).optional(),
  document: z.string().max(20).optional(),
});

export async function createMembership(_: ClubActionState, formData: FormData): Promise<ClubActionState> {
  const parsed = createMembershipSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisá los datos: falta algo." };
  const linkingExisting = !!parsed.data.customerId;
  if (!linkingExisting && (!parsed.data.firstName || !parsed.data.lastName || !z.email().safeParse(parsed.data.email).success)) {
    return { error: "Revisá los datos: falta algo o el email no es válido." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_membership", {
    target_org: parsed.data.organizationId,
    target_category: parsed.data.categoryId,
    target_member_number: parsed.data.memberNumber,
    target_first_name: parsed.data.firstName ?? "",
    target_last_name: parsed.data.lastName ?? "",
    target_email: parsed.data.email ?? "",
    target_phone: parsed.data.phone ?? null,
    target_document: parsed.data.document ?? null,
    target_customer_id: parsed.data.customerId ?? null,
  });
  if (error) {
    if (error.message?.includes("MEMBER_NUMBER_TAKEN")) return { error: "Ese número de socio ya está en uso." };
    if (error.message?.includes("CUSTOMER_ALREADY_MEMBER")) return { error: "Esa persona ya es socia." };
    return { error: "No pudimos crear el socio." };
  }
  redirect(`/app/socios/${data}` as never);
}

const categorySchema = z.object({ organizationId: z.string().uuid(), id: z.string().uuid().optional(), name: z.string().min(1).max(60), monthlyFeeAmount: z.coerce.number().min(0) });

export async function upsertMembershipCategory(_: ClubActionState, formData: FormData): Promise<ClubActionState> {
  const parsed = categorySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisá el nombre y el monto de la cuota." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_membership_category", {
    target_org: parsed.data.organizationId, target_id: parsed.data.id ?? null,
    target_name: parsed.data.name, target_monthly_fee_amount: Math.round(parsed.data.monthlyFeeAmount * 100), target_active: true,
  });
  if (error) return { error: "No pudimos guardar la categoría." };
  revalidatePath("/app/socios");
  revalidatePath("/app/socios/nuevo");
  return { success: "Categoría guardada." };
}

export async function setMembershipStatus(formData: FormData) {
  const membershipId = String(formData.get("membershipId") ?? "");
  const status = String(formData.get("status") ?? "");
  const reason = String(formData.get("reason") ?? "");
  if (!membershipId || !["active", "suspended", "cancelled"].includes(status)) return;
  const supabase = await createClient();
  await supabase.rpc("set_membership_status", { target_membership: membershipId, target_status: status as "active" | "suspended" | "cancelled", target_reason: reason || null });
  revalidatePath(`/app/socios/${membershipId}`);
  revalidatePath("/app/socios");
}

export async function generateDuesForPeriod(formData: FormData) {
  const organizationId = String(formData.get("organizationId") ?? "");
  const categoryId = String(formData.get("categoryId") ?? "") || null;
  const period = String(formData.get("period") ?? "");
  if (!organizationId || !period) return;
  const supabase = await createClient();
  await supabase.rpc("generate_dues_for_period", { target_org: organizationId, target_category: categoryId, target_period: period });
  revalidatePath("/app/socios");
}

export async function createMembershipDue(formData: FormData) {
  const membershipId = String(formData.get("membershipId") ?? "");
  const period = String(formData.get("period") ?? "");
  const amount = Number(formData.get("amount") ?? 0);
  const dueDate = String(formData.get("dueDate") ?? "");
  if (!membershipId || !period || !dueDate || Number.isNaN(amount)) return;
  const supabase = await createClient();
  await supabase.rpc("create_membership_due", { target_membership: membershipId, target_period: period, target_amount: Math.round(amount * 100), target_due_date: dueDate });
  revalidatePath(`/app/socios/${membershipId}`);
}

const manualPaymentSchema = z.object({
  membershipId: z.string().uuid(), dueId: z.string().uuid(), paidAmount: z.coerce.number().min(0),
  paymentMethod: z.enum(["cash", "transfer", "other"]), paymentReference: z.string().max(80).optional(),
});

export async function recordManualDuePayment(_: ClubActionState, formData: FormData): Promise<ClubActionState> {
  const parsed = manualPaymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisá el importe y el medio de pago." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_manual_due_payment", {
    target_due: parsed.data.dueId, target_paid_amount: Math.round(parsed.data.paidAmount * 100),
    target_payment_method: parsed.data.paymentMethod, target_payment_reference: parsed.data.paymentReference ?? null,
  });
  if (error) return { error: error.message?.includes("DUE_ALREADY_PAID") ? "Esa cuota ya estaba pagada." : "No pudimos registrar el pago." };
  revalidatePath(`/app/socios/${parsed.data.membershipId}`);
  revalidatePath("/app/socios");
  return { success: "Pago registrado." };
}
