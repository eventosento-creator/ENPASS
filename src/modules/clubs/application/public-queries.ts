import "server-only";

import { cache } from "react";
import { createClient } from "@/shared/database/server";
import type { PublicClubCategory, PublicClubListing, PublicClubProfile } from "../domain/club";

export const getPublicClubs = cache(async (): Promise<PublicClubListing[]> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_public_clubs_discovery");
  return (data ?? []).map((row) => ({
    organizationId: row.organization_id, slug: row.slug, name: row.name, description: row.description,
    logoUrl: row.logo_url, accentColor: row.accent_color, categoryCount: row.category_count,
  }));
});

export const getPublicClubProfile = cache(async (slug: string): Promise<PublicClubProfile | null> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_public_club_profile", { target_slug: slug });
  const row = data?.[0];
  if (!row) return null;
  return {
    organizationId: row.organization_id, slug: row.slug, name: row.name, description: row.description,
    logoUrl: row.logo_url, accentColor: row.accent_color, currency: row.currency,
  };
});

export const getPublicClubCategories = cache(async (organizationId: string): Promise<PublicClubCategory[]> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_public_club_categories", { target_org: organizationId });
  return (data ?? []).map((row) => ({ id: row.id, name: row.name, monthlyFeeAmount: row.monthly_fee_amount }));
});
