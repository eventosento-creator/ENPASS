"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/shared/database/server";
import { createDueCheckout } from "./create-due-checkout";
import { createDivisionDueCheckout } from "./create-division-due-checkout";
import { sendDivisionDueGeneratedEmail, sendDivisionDuePaidEmail, sendDueGeneratedEmail, sendDuePaidEmail, sendMembershipWelcomeEmail } from "./membership-emails";
import type { CustomerCandidate, MemberRow, MembershipDue } from "../domain/club";
import { getDivisionDues, getNextMemberNumber, searchMembers } from "./queries";
import { getCurrentOrganization } from "@/modules/organizations/application/queries";
import { incrementMemberNumber, mapHeaders, normalizeKey, parseCsv } from "../domain/members-csv";

const brandFrom = (row: { brand_logo_url: string | null; brand_name: string | null; brand_accent_color: string | null }) => ({
  logoUrl: row.brand_logo_url, name: row.brand_name, accentColor: row.brand_accent_color,
});

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

export async function createDivisionDueCheckoutLink(_: DueCheckoutState, formData: FormData): Promise<DueCheckoutState> {
  const dueId = String(formData.get("dueId") ?? "");
  if (!dueId) return { error: "Falta la cuota." };
  try {
    const { checkoutUrl } = await createDivisionDueCheckout(dueId);
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

const brandingSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().max(60).optional(),
  accentColor: z.string().optional(),
});

function validateLogo(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return "Usá una imagen JPG, PNG o WebP.";
  if (file.size > 2 * 1024 * 1024) return "El logo puede pesar hasta 2 MB.";
  return null;
}

export async function updateClubBranding(_: ClubActionState, formData: FormData): Promise<ClubActionState> {
  const parsed = brandingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisá los datos." };
  const accentColor = parsed.data.accentColor && /^#[0-9a-fA-F]{6}$/.test(parsed.data.accentColor) ? parsed.data.accentColor : null;
  const supabase = await createClient();

  let logoUrl: string | null | undefined;
  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    const validationError = validateLogo(logo);
    if (validationError) return { error: validationError };
    const extension = logo.type === "image/png" ? "png" : logo.type === "image/webp" ? "webp" : "jpg";
    const path = `${parsed.data.organizationId}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from("club-logos").upload(path, logo, { contentType: logo.type, cacheControl: "3600" });
    if (uploadError) return { error: "No pudimos subir el logo." };
    logoUrl = supabase.storage.from("club-logos").getPublicUrl(path).data.publicUrl;
  }

  const { data: current } = await supabase.from("club_settings").select("brand_logo_url").eq("organization_id", parsed.data.organizationId).maybeSingle();
  const { error } = await supabase.rpc("set_club_branding", {
    target_org: parsed.data.organizationId,
    target_logo_url: logoUrl ?? current?.brand_logo_url ?? null,
    target_name: parsed.data.name ?? null,
    target_accent_color: accentColor,
  });
  if (error) return { error: "No pudimos guardar la identidad del club." };
  revalidatePath("/app/settings");
  return { success: "Identidad guardada." };
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
    if (error.message?.includes("DOCUMENT_TAKEN")) return { error: "Ya hay otro socio con ese DNI." };
    return { error: "No pudimos crear el socio." };
  }
  const result = data?.[0];
  if (result?.customer_email) {
    await sendMembershipWelcomeEmail({
      to: result.customer_email, firstName: result.customer_first_name, organizationName: result.organization_name,
      memberNumber: parsed.data.memberNumber, categoryName: result.category_name, brand: brandFrom(result),
    });
    if (result.due_id) {
      await sendDueGeneratedEmail({
        dueId: result.due_id, to: result.customer_email, firstName: result.customer_first_name,
        organizationName: result.organization_name, period: result.due_period, amount: result.due_amount, dueDate: result.due_date,
        brand: brandFrom(result),
      });
    }
  }
  redirect(`/app/socios/${result?.membership_id}` as never);
}

const categorySchema = z.object({ organizationId: z.string().uuid(), id: z.string().uuid().optional(), name: z.string().min(1).max(60), monthlyFeeAmount: z.coerce.number().min(0), active: z.string().optional() });

export async function upsertMembershipCategory(_: ClubActionState, formData: FormData): Promise<ClubActionState> {
  const parsed = categorySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisá el nombre y el monto de la cuota." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_membership_category", {
    target_org: parsed.data.organizationId, target_id: parsed.data.id ?? null,
    target_name: parsed.data.name, target_monthly_fee_amount: Math.round(parsed.data.monthlyFeeAmount * 100), target_active: parsed.data.active === "true",
  });
  if (error) return { error: "No pudimos guardar la categoría." };
  revalidatePath("/app/socios");
  revalidatePath("/app/socios/nuevo");
  revalidatePath("/app/socios/categorias");
  return { success: "Categoría guardada." };
}

export async function toggleCategoryActive(formData: FormData) {
  const organizationId = String(formData.get("organizationId") ?? "");
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "");
  const monthlyFeeAmount = Number(formData.get("monthlyFeeAmount") ?? 0);
  const nextActive = formData.get("nextActive") === "true";
  if (!organizationId || !id) return;
  const supabase = await createClient();
  await supabase.rpc("upsert_membership_category", {
    target_org: organizationId, target_id: id, target_name: name, target_monthly_fee_amount: monthlyFeeAmount, target_active: nextActive,
  });
  revalidatePath("/app/socios/categorias");
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
  const { data } = await supabase.rpc("generate_dues_for_period", { target_org: organizationId, target_category: categoryId, target_period: period });
  await Promise.allSettled((data ?? []).filter((row) => row.customer_email).map((row) => sendDueGeneratedEmail({
    dueId: row.due_id, to: row.customer_email, firstName: row.customer_first_name, organizationName: row.organization_name,
    period: row.due_period, amount: row.due_amount, dueDate: row.due_date, brand: brandFrom(row),
  })));
  revalidatePath("/app/socios");
}

export async function createMembershipDue(formData: FormData) {
  const membershipId = String(formData.get("membershipId") ?? "");
  const period = String(formData.get("period") ?? "");
  const amount = Number(formData.get("amount") ?? 0);
  const dueDate = String(formData.get("dueDate") ?? "");
  if (!membershipId || !period || !dueDate || Number.isNaN(amount)) return;
  const supabase = await createClient();
  const { data } = await supabase.rpc("create_membership_due", { target_membership: membershipId, target_period: period, target_amount: Math.round(amount * 100), target_due_date: dueDate });
  const result = data?.[0];
  if (result?.customer_email) {
    await sendDueGeneratedEmail({
      dueId: result.due_id, to: result.customer_email, firstName: result.customer_first_name, organizationName: result.organization_name,
      period: result.due_period, amount: result.due_amount, dueDate: result.due_date, brand: brandFrom(result),
    });
  }
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
  const { data, error } = await supabase.rpc("record_manual_due_payment", {
    target_due: parsed.data.dueId, target_paid_amount: Math.round(parsed.data.paidAmount * 100),
    target_payment_method: parsed.data.paymentMethod, target_payment_reference: parsed.data.paymentReference ?? null,
  });
  if (error) return { error: error.message?.includes("DUE_ALREADY_PAID") ? "Esa cuota ya estaba pagada." : "No pudimos registrar el pago." };
  const result = data?.[0];
  if (result?.customer_email) {
    await sendDuePaidEmail({
      to: result.customer_email, firstName: result.customer_first_name, organizationName: result.organization_name,
      period: result.due_period, amount: result.paid_amount, paymentMethod: result.payment_method, brand: brandFrom(result),
    });
  }
  revalidatePath(`/app/socios/${parsed.data.membershipId}`);
  revalidatePath("/app/socios");
  return { success: "Pago registrado." };
}

// ---------------------------------------------------------------------------------------------
// Divisiones
// ---------------------------------------------------------------------------------------------

const divisionSchema = z.object({ organizationId: z.string().uuid(), id: z.string().uuid().optional(), name: z.string().min(1).max(60), monthlyFeeAmount: z.coerce.number().min(0), active: z.string().optional() });

export async function upsertDivision(_: ClubActionState, formData: FormData): Promise<ClubActionState> {
  const parsed = divisionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisá el nombre y el monto de la cuota." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_division", {
    target_org: parsed.data.organizationId, target_id: parsed.data.id ?? null,
    target_name: parsed.data.name, target_monthly_fee_amount: Math.round(parsed.data.monthlyFeeAmount * 100), target_active: parsed.data.active === "true",
  });
  if (error) return { error: error.message?.includes("DIVISION_NAME_TAKEN") ? "Ya existe una división con ese nombre." : "No pudimos guardar la división." };
  revalidatePath("/app/socios/divisiones");
  return { success: "División guardada." };
}

export async function toggleDivisionActive(formData: FormData) {
  const organizationId = String(formData.get("organizationId") ?? "");
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "");
  const monthlyFeeAmount = Number(formData.get("monthlyFeeAmount") ?? 0);
  const nextActive = formData.get("nextActive") === "true";
  if (!organizationId || !id) return;
  const supabase = await createClient();
  await supabase.rpc("upsert_division", { target_org: organizationId, target_id: id, target_name: name, target_monthly_fee_amount: monthlyFeeAmount, target_active: nextActive });
  revalidatePath("/app/socios/divisiones");
}

export async function enrollMembershipInDivision(_: ClubActionState, formData: FormData): Promise<ClubActionState> {
  const membershipId = String(formData.get("membershipId") ?? "");
  const divisionId = String(formData.get("divisionId") ?? "");
  if (!membershipId || !divisionId) return { error: "Elegí una división." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("enroll_membership_in_division", { target_membership: membershipId, target_division: divisionId });
  if (error) return { error: "No pudimos anotar al socio." };
  const result = data?.[0];
  if (result?.customer_email && result.due_id) {
    await sendDivisionDueGeneratedEmail({
      dueId: result.due_id, to: result.customer_email, firstName: result.customer_first_name, organizationName: result.organization_name,
      divisionName: result.division_name, period: result.due_period, amount: result.due_amount, dueDate: result.due_date,
      brand: brandFrom(result),
    });
  }
  revalidatePath(`/app/socios/${membershipId}`);
  revalidatePath("/app/socios/divisiones");
  return { success: "Socio anotado." };
}

export async function removeMembershipFromDivision(formData: FormData) {
  const enrollmentId = String(formData.get("enrollmentId") ?? "");
  const membershipId = String(formData.get("membershipId") ?? "");
  if (!enrollmentId) return;
  const supabase = await createClient();
  await supabase.rpc("remove_membership_from_division", { target_enrollment: enrollmentId });
  if (membershipId) revalidatePath(`/app/socios/${membershipId}`);
  revalidatePath("/app/socios/divisiones");
}

export async function generateDivisionDuesForPeriod(formData: FormData) {
  const divisionId = String(formData.get("divisionId") ?? "");
  const period = String(formData.get("period") ?? "");
  if (!divisionId || !period) return;
  const supabase = await createClient();
  const { data } = await supabase.rpc("generate_division_dues_for_period", { target_division: divisionId, target_period: period });
  await Promise.allSettled((data ?? []).filter((row) => row.customer_email).map((row) => sendDivisionDueGeneratedEmail({
    dueId: row.due_id, to: row.customer_email, firstName: row.customer_first_name, organizationName: row.organization_name,
    divisionName: row.division_name, period: row.due_period, amount: row.due_amount, dueDate: row.due_date, brand: brandFrom(row),
  })));
  revalidatePath(`/app/socios/divisiones/${divisionId}`);
}

export async function createDivisionDue(formData: FormData) {
  const enrollmentId = String(formData.get("enrollmentId") ?? "");
  const divisionId = String(formData.get("divisionId") ?? "");
  const period = String(formData.get("period") ?? "");
  const amount = Number(formData.get("amount") ?? 0);
  const dueDate = String(formData.get("dueDate") ?? "");
  if (!enrollmentId || !period || !dueDate || Number.isNaN(amount)) return;
  const supabase = await createClient();
  const { data } = await supabase.rpc("create_division_due", { target_enrollment: enrollmentId, target_period: period, target_amount: Math.round(amount * 100), target_due_date: dueDate });
  const result = data?.[0];
  if (result?.customer_email) {
    await sendDivisionDueGeneratedEmail({
      dueId: result.due_id, to: result.customer_email, firstName: result.customer_first_name, organizationName: result.organization_name,
      divisionName: result.division_name, period: result.due_period, amount: result.due_amount, dueDate: result.due_date,
      brand: brandFrom(result),
    });
  }
  revalidatePath(`/app/socios/divisiones/${divisionId}`);
}

const manualDivisionPaymentSchema = z.object({
  divisionId: z.string().uuid(), dueId: z.string().uuid(), paidAmount: z.coerce.number().min(0),
  paymentMethod: z.enum(["cash", "transfer", "other"]), paymentReference: z.string().max(80).optional(),
});

export async function recordManualDivisionDuePayment(_: ClubActionState, formData: FormData): Promise<ClubActionState> {
  const parsed = manualDivisionPaymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisá el importe y el medio de pago." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_manual_division_due_payment", {
    target_due: parsed.data.dueId, target_paid_amount: Math.round(parsed.data.paidAmount * 100),
    target_payment_method: parsed.data.paymentMethod, target_payment_reference: parsed.data.paymentReference ?? null,
  });
  if (error) return { error: error.message?.includes("DUE_ALREADY_PAID") ? "Esa cuota ya estaba pagada." : "No pudimos registrar el pago." };
  const result = data?.[0];
  if (result?.customer_email) {
    await sendDivisionDuePaidEmail({
      to: result.customer_email, firstName: result.customer_first_name, organizationName: result.organization_name,
      divisionName: result.division_name, period: result.due_period, amount: result.paid_amount, paymentMethod: result.payment_method,
      brand: brandFrom(result),
    });
  }
  revalidatePath(`/app/socios/divisiones/${parsed.data.divisionId}`);
  return { success: "Pago registrado." };
}

export type MemberSearchState = { results: MemberRow[] };

export async function searchMembersForEnroll(_: MemberSearchState, formData: FormData): Promise<MemberSearchState> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const query = String(formData.get("query") ?? "");
  if (!organizationId) return { results: [] };
  const results = await searchMembers(organizationId, query);
  return { results: results.filter((m) => m.membershipStatus === "active") };
}

export type DivisionDuesState = { dues: MembershipDue[] };

export async function loadDivisionDues(_: DivisionDuesState, formData: FormData): Promise<DivisionDuesState> {
  const enrollmentId = String(formData.get("enrollmentId") ?? "");
  if (!enrollmentId) return { dues: [] };
  return { dues: await getDivisionDues(enrollmentId) };
}

const listingSchema = z.object({ organizationId: z.string().uuid(), wantPublic: z.string().optional(), description: z.string().max(600).optional() });

export async function updateClubPublicListing(_: ClubActionState, formData: FormData): Promise<ClubActionState> {
  const parsed = listingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisá los datos." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_club_public_listing", {
    target_org: parsed.data.organizationId,
    target_want_public: parsed.data.wantPublic === "true",
    target_description: parsed.data.description ?? null,
  });
  if (error) return { error: "No pudimos guardar. Probá de nuevo en unos segundos." };
  revalidatePath("/app/settings");
  return { success: parsed.data.wantPublic === "true" ? "Enviado a revisión de ENPASS." : "Club dado de baja del listado público." };
}

export async function approveMembershipRequest(_: ClubActionState, formData: FormData): Promise<ClubActionState> {
  const requestId = String(formData.get("requestId") ?? "");
  const memberNumber = String(formData.get("memberNumber") ?? "").trim();
  if (!requestId || !memberNumber) return { error: "Falta el número de socio." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("approve_club_membership_request", { target_request: requestId, target_member_number: memberNumber });
  if (error) {
    if (error.message?.includes("MEMBER_NUMBER_TAKEN")) return { error: "Ese número de socio ya está en uso." };
    if (error.message?.includes("CUSTOMER_ALREADY_MEMBER")) return { error: "Esa persona ya es socia." };
    if (error.message?.includes("DOCUMENT_TAKEN")) return { error: "Ya hay otro socio con ese DNI." };
    if (error.message?.includes("REQUEST_ALREADY_REVIEWED")) return { error: "Esa solicitud ya fue revisada." };
    return { error: "No pudimos aprobar la solicitud." };
  }
  const result = data?.[0];
  if (result?.customer_email) {
    await sendMembershipWelcomeEmail({
      to: result.customer_email, firstName: result.customer_first_name, organizationName: result.organization_name,
      memberNumber, categoryName: result.category_name, brand: brandFrom(result),
    });
    if (result.due_id) {
      await sendDueGeneratedEmail({
        dueId: result.due_id, to: result.customer_email, firstName: result.customer_first_name,
        organizationName: result.organization_name, period: result.due_period, amount: result.due_amount, dueDate: result.due_date,
        brand: brandFrom(result),
      });
    }
  }
  revalidatePath("/app/socios/solicitudes");
  revalidatePath("/app/socios");
  return { success: "Socio dado de alta." };
}

export async function rejectMembershipRequest(_: ClubActionState, formData: FormData): Promise<ClubActionState> {
  const requestId = String(formData.get("requestId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  if (!requestId) return { error: "Falta la solicitud." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_club_membership_request", { target_request: requestId, target_rejection_reason: reason || null });
  if (error) return { error: "No pudimos rechazar la solicitud." };
  revalidatePath("/app/socios/solicitudes");
  return { success: "Solicitud rechazada." };
}

export type ImportMembersState = { error?: string; created?: number; skipped?: number; problems?: Array<{ line: number; message: string }> };

const IMPORT_MAX_ROWS = 1000;

/** Importa socios desde un CSV (Nº Socio, Nombre, Apellido, DNI, Mail, Celular, Categoria, Division).
 * Por fila: valida, da de alta con create_membership (reusa/crea el cliente por DNI o mail) y anota en las
 * divisiones. No manda mails: son socios que el club ya tenía. Las categorías y divisiones tienen que existir. */
export async function importMembersCsv(_: ImportMembersState, formData: FormData): Promise<ImportMembersState> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Elegí un archivo CSV." };
  if (file.size > 1_000_000) return { error: "El archivo es muy grande (máximo 1 MB)." };
  const org = await getCurrentOrganization();
  if (!org || !["owner", "admin"].includes(org.role)) return { error: "No tenés permiso para importar socios." };

  const rows = parseCsv(await file.text());
  const header = rows.shift();
  if (!header) return { error: "El archivo está vacío." };
  const columns = mapHeaders(header);
  const missing = (["firstName", "lastName", "email", "category"] as const).filter((field) => columns[field] === undefined);
  if (missing.length) return { error: "Faltan columnas en la primera fila. Usá la plantilla: Nº Socio, Nombre, Apellido, DNI, Mail, Celular, Categoria, Division." };
  if (rows.length > IMPORT_MAX_ROWS) return { error: `Máximo ${IMPORT_MAX_ROWS} socios por archivo. Dividilo en partes.` };

  const supabase = await createClient();
  const [{ data: categories }, { data: divisionRows }, firstNumber] = await Promise.all([
    supabase.from("membership_categories").select("id, name").eq("organization_id", org.id).eq("active", true),
    supabase.from("divisions").select("id, name").eq("organization_id", org.id).eq("active", true),
    getNextMemberNumber(org.id),
  ]);
  const categoryByName = new Map((categories ?? []).map((category) => [normalizeKey(category.name), category.id]));
  const divisionByName = new Map((divisionRows ?? []).map((division) => [normalizeKey(division.name), division.id]));

  const cell = (row: string[], field: keyof typeof columns) => (columns[field] === undefined ? "" : (row[columns[field]!] ?? "").trim());
  let nextNumber = firstNumber;
  let created = 0;
  const problems: Array<{ line: number; message: string }> = [];

  for (const [index, row] of rows.entries()) {
    const line = index + 2;
    const firstName = cell(row, "firstName");
    const lastName = cell(row, "lastName");
    const email = cell(row, "email");
    const categoryName = cell(row, "category");
    const categoryId = categoryByName.get(normalizeKey(categoryName));
    const divisions = cell(row, "division").split(/[;|]/).map((name) => name.trim()).filter(Boolean);
    const unknownDivision = divisions.find((name) => !divisionByName.has(normalizeKey(name)));
    if (!firstName || !lastName) { problems.push({ line, message: "Falta nombre o apellido." }); continue; }
    if (!z.email().safeParse(email).success) { problems.push({ line, message: `Mail inválido: "${email}".` }); continue; }
    if (!categoryId) { problems.push({ line, message: categoryName ? `La categoría "${categoryName}" no existe o está inactiva. Creala en Categorías.` : "Falta la categoría." }); continue; }
    if (unknownDivision) { problems.push({ line, message: `La división "${unknownDivision}" no existe o está inactiva. Creala en Divisiones.` }); continue; }

    const providedNumber = cell(row, "memberNumber");
    let memberNumber = providedNumber || nextNumber;
    let membershipId: string | undefined;
    for (let attempt = 0; attempt < 5 && !membershipId; attempt += 1) {
      const { data, error } = await supabase.rpc("create_membership", {
        target_org: org.id, target_category: categoryId, target_member_number: memberNumber,
        target_first_name: firstName, target_last_name: lastName, target_email: email,
        target_phone: cell(row, "phone") || null, target_document: cell(row, "document") || null, target_customer_id: null,
      });
      if (!error) { membershipId = data?.[0]?.membership_id; break; }
      if (error.message?.includes("MEMBER_NUMBER_TAKEN") && !providedNumber && /^\d+$/.test(memberNumber)) { memberNumber = incrementMemberNumber(memberNumber); continue; }
      problems.push({ line, message: error.message?.includes("MEMBER_NUMBER_TAKEN") ? `El N° de socio ${memberNumber} ya está en uso.` : error.message?.includes("CUSTOMER_ALREADY_MEMBER") ? "Esa persona ya es socia (mismo DNI o mail)." : error.message?.includes("DOCUMENT_TAKEN") ? "Ya hay otro socio con ese DNI." : "No pudimos dar de alta este socio." });
      break;
    }
    if (!membershipId) continue;
    created += 1;
    if (!providedNumber && /^\d+$/.test(memberNumber)) nextNumber = incrementMemberNumber(memberNumber);
    for (const name of divisions) {
      const { error } = await supabase.rpc("enroll_membership_in_division", { target_membership: membershipId, target_division: divisionByName.get(normalizeKey(name))! });
      if (error) problems.push({ line, message: `Socio creado, pero no pudimos anotarlo en la división "${name}".` });
    }
  }
  revalidatePath("/app/socios");
  revalidatePath("/app/socios/divisiones");
  return { created, skipped: rows.length - created, problems };
}
