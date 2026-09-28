import "server-only";

import { cache } from "react";
import { createClient } from "@/shared/database/server";
import type { MemberRow, MembershipDetail, MembershipDue } from "../domain/club";

export const isClubEnabled = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("club_settings").select("enabled").eq("organization_id", organizationId).maybeSingle();
  return data?.enabled ?? false;
});

export const getClubBranding = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("club_settings").select("brand_logo_url, brand_name, brand_accent_color").eq("organization_id", organizationId).maybeSingle();
  return { logoUrl: data?.brand_logo_url ?? null, name: data?.brand_name ?? null, accentColor: data?.brand_accent_color ?? null };
});

export async function searchMembers(organizationId: string, query = ""): Promise<MemberRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_memberships", { target_org: organizationId, target_query: query });
  if (error || !data) return [];
  return data.map((row) => ({
    membershipId: row.membership_id, customerId: row.customer_id, memberNumber: row.member_number,
    firstName: row.first_name, lastName: row.last_name, email: row.email, document: row.document,
    categoryName: row.category_name, membershipStatus: row.membership_status,
    dueStatus: row.due_status, dueAmount: row.due_amount, dueDate: row.due_date,
  }));
}

export async function getMembershipCategories(organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("membership_categories").select("*").eq("organization_id", organizationId).order("sort_order");
  return data ?? [];
}

export async function getMembershipDetail(membershipId: string): Promise<MembershipDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_membership_detail", { target_membership: membershipId });
  const row = data?.[0];
  if (error || !row) return null;
  return {
    membershipId: row.membership_id, organizationId: row.organization_id, customerId: row.customer_id,
    memberNumber: row.member_number, firstName: row.first_name, lastName: row.last_name, email: row.email,
    phone: row.phone, document: row.document, categoryId: row.category_id, categoryName: row.category_name,
    membershipStatus: row.membership_status, statusReason: row.status_reason, statusChangedAt: row.status_changed_at,
    startsAt: row.starts_at, notes: row.notes,
  };
}

export async function getMembershipDues(membershipId: string): Promise<MembershipDue[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_membership_dues", { target_membership: membershipId });
  if (error || !data) return [];
  return data.map((row) => ({
    dueId: row.due_id, period: row.period, amount: row.amount, dueDate: row.due_date, paidAt: row.paid_at,
    paidAmount: row.paid_amount, paymentMethod: row.payment_method, paymentReference: row.payment_reference,
    status: row.status,
  }));
}
