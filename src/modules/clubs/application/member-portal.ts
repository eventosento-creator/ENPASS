import "server-only";

import { cache } from "react";
import { createAdminClient } from "@/shared/database/admin";
import { getMemberSessionHash } from "../infrastructure/member-session";
import type { MembershipDue } from "../domain/club";

export type PortalClub = { organizationId: string; name: string; slug: string; logoUrl: string | null; brandName: string | null; accentColor: string | null };

export const getPortalClub = cache(async (slug: string): Promise<PortalClub | null> => {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  const { data } = await createAdminClient().rpc("member_portal_club", { target_slug: slug });
  const row = data?.[0];
  return row ? { organizationId: row.organization_id, name: row.name, slug: row.slug, logoUrl: row.logo_url, brandName: row.brand_name, accentColor: row.accent_color } : null;
});

export const getMemberProfile = cache(async (slug: string) => {
  const hash = await getMemberSessionHash(slug);
  if (!hash) return null;
  const { data } = await createAdminClient().rpc("member_get_profile", { target_session_hash: hash });
  const row = data?.[0];
  // La sesión tiene que ser del club de la URL (la cookie ya es por slug, esto es defensa en profundidad).
  return row && row.club_slug === slug ? row : null;
});

export async function getMemberDues(slug: string): Promise<Array<{ concept: string; due: MembershipDue }>> {
  const hash = await getMemberSessionHash(slug);
  if (!hash) return [];
  const { data } = await createAdminClient().rpc("member_get_dues", { target_session_hash: hash });
  return (data ?? []).map((row) => ({
    concept: row.concept,
    due: { dueId: `${row.concept}-${row.period}`, period: row.period, amount: row.amount, dueDate: row.due_date, paidAt: row.paid_at, paidAmount: row.paid_amount, paymentMethod: row.payment_method, paymentReference: row.payment_reference, status: row.status },
  }));
}

export type MemberPendingDue = { dueId: string; kind: "club" | "division"; concept: string; period: string; amount: number; dueDate: string; overdue: boolean };

/** Cuotas sin pagar del socio de la sesión (con su id real, para poder cobrarlas online). */
export async function getMemberPendingDues(slug: string): Promise<MemberPendingDue[]> {
  const hash = await getMemberSessionHash(slug);
  if (!hash) return [];
  const { data } = await createAdminClient().rpc("member_pending_dues", { target_session_hash: hash });
  return (data ?? []).map((row) => ({ dueId: row.due_id, kind: row.kind as "club" | "division", concept: row.concept, period: row.period, amount: row.amount, dueDate: row.due_date, overdue: row.overdue }));
}
