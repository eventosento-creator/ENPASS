"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/shared/database/server";
import { slugify } from "@/shared/lib/format";
import type { ActionState } from "@/modules/identity/application/actions";
import { safeProducerPath } from "@/shared/lib/navigation";

const organizationSchema = z.object({ name: z.string().trim().min(2).max(100) });
const venueSchema = z.object({
  organizationId: z.uuid(), name: z.string().trim().min(2).max(120), address: z.string().trim().min(3).max(200),
  city: z.string().trim().min(2), province: z.string().trim().min(2), capacity: z.coerce.number().int().positive().max(100000),
  timezone: z.string().min(3),
});

export async function createOrganization(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = organizationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Ingresá un nombre para tu organización." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_organization", { org_name: parsed.data.name, org_slug: `${slugify(parsed.data.name)}-${crypto.randomUUID().slice(0, 6)}` });
  if (error || !data) return { error: "No pudimos crear la organización." };
  redirect(`/app/onboarding?organization=${data}&next=${encodeURIComponent(safeProducerPath(formData.get("next")))}`);
}

export async function createVenue(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = venueSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisá los datos del lugar." };
  const supabase = await createClient();
  const { organizationId, ...venue } = parsed.data;
  const { error } = await supabase.from("venues").insert({ organization_id: organizationId, ...venue });
  if (error) return { error: "No pudimos guardar el lugar." };
  revalidatePath("/app");
  redirect(safeProducerPath(formData.get("next")));
}
