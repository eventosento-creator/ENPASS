"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/shared/database/server";
import { slugify } from "@/shared/lib/format";
import type { ActionState } from "@/modules/identity/application/actions";
import { safeProducerPath } from "@/shared/lib/navigation";

const organizationSchema = z.object({ name: z.string().trim().min(2).max(100), intent: z.enum(["event", "club"]).optional() });
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
  if (parsed.data.intent === "club") {
    // El club no necesita el paso de "lugar" del onboarding de eventos — va directo a
    // activar el módulo y cargar su primera categoría.
    await supabase.rpc("set_club_enabled", { target_org: data, target_enabled: true });
    redirect("/app/socios/categorias?welcome=1" as never);
  }
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

const updateVenueSchema = venueSchema.extend({ venueId: z.uuid() });

export async function updateVenue(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = updateVenueSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisá los datos del lugar." };
  const supabase = await createClient();
  const { organizationId, venueId, ...venue } = parsed.data;
  const { error } = await supabase.from("venues").update(venue).eq("id", venueId).eq("organization_id", organizationId);
  if (error) return { error: "No pudimos guardar los cambios." };
  revalidatePath("/app/venues");
  redirect(safeProducerPath(formData.get("next")));
}

export type DeleteVenueState = { error?: string };

export async function deleteVenue(_: DeleteVenueState, formData: FormData): Promise<DeleteVenueState> {
  const venueId = String(formData.get("venueId") ?? "");
  const organizationId = String(formData.get("organizationId") ?? "");
  if (!venueId || !organizationId) return { error: "Faltan datos." };
  const supabase = await createClient();
  const { error } = await supabase.from("venues").delete().eq("id", venueId).eq("organization_id", organizationId);
  if (error) {
    if (error.code === "23503") return { error: "No podés borrar este lugar: tiene eventos creados. Borrá o movés esos eventos primero." };
    return { error: "No pudimos borrar el lugar." };
  }
  revalidatePath("/app/venues");
  return {};
}

const renameSchema = z.object({ organizationId: z.uuid(), name: z.string().trim().min(2, "El nombre necesita al menos 2 letras.").max(100, "El nombre puede tener hasta 100 caracteres.") });

/** Cambia el nombre del espacio. El link público (slug) NO cambia: los links ya compartidos siguen funcionando. */
export async function renameOrganization(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = renameSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revisá el nombre." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("organizations").update({ name: parsed.data.name }).eq("id", parsed.data.organizationId).select("id");
  // RLS no da error si no te deja editar: simplemente no actualiza ninguna fila.
  if (error || !data?.length) return { error: "No pudimos cambiar el nombre. Solo el dueño o un admin puede hacerlo." };
  revalidatePath("/app", "layout");
  return { success: "Nombre actualizado." };
}
