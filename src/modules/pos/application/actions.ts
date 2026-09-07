"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentOrganization } from "@/modules/organizations/application/queries";
import { createClient } from "@/shared/database/server";
import type { ActionState } from "@/modules/identity/application/actions";

export type PosActionState = ActionState & { pin?: string };

const categorySchema = z.object({ name: z.string().trim().min(1).max(80) });
const productSchema = z.object({
  name: z.string().trim().min(1).max(120),
  categoryId: z.preprocess((value) => value || undefined, z.uuid().optional()),
  pricePesos: z.preprocess((value) => value === "" ? undefined : value, z.coerce.number().int().nonnegative().optional()),
  sku: z.string().trim().max(80).default(""), barcode: z.string().trim().max(120).default(""),
  description: z.string().trim().max(1000).default(""),
});
const eventProductsSchema = z.object({ eventId: z.uuid(), productIds: z.array(z.uuid()).min(1) });
const eventProductUpdateSchema = z.object({ eventId: z.uuid(), eventProductId: z.uuid(), pricePesos: z.coerce.number().int().nonnegative(), enabled: z.enum(["true", "false"]) });
const locationSchema = z.object({ eventId: z.uuid(), name: z.string().trim().min(2).max(100), description: z.string().trim().max(400).default(""), eventProductIds: z.array(z.uuid()).min(1) });
const deviceSchema = z.object({ eventId: z.uuid(), locationId: z.uuid(), name: z.string().trim().min(2).max(80) });

export async function createProductCategory(_: PosActionState, formData: FormData): Promise<PosActionState> {
  const parsed = categorySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Escribí un nombre para la categoría." };
  const organization = await getCurrentOrganization();
  if (!organization) return { error: "Tu sesión venció." };
  const supabase = await createClient();
  const { error } = await supabase.from("product_categories").insert({ organization_id: organization.id, name: parsed.data.name });
  if (error) return { error: error.code === "23505" ? "Ya existe una categoría con ese nombre." : "No pudimos crear la categoría." };
  revalidatePath("/app/products");
  return { success: "Categoría creada." };
}

export async function createProduct(_: PosActionState, formData: FormData): Promise<PosActionState> {
  const parsed = productSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisá el nombre y el precio habitual." };
  const organization = await getCurrentOrganization();
  if (!organization) return { error: "Tu sesión venció." };
  const supabase = await createClient();
  const { error } = await supabase.from("products").insert({
    organization_id: organization.id, name: parsed.data.name, category_id: parsed.data.categoryId ?? null,
    default_price_amount: parsed.data.pricePesos === undefined ? null : parsed.data.pricePesos * 100,
    currency: organization.default_currency, sku: parsed.data.sku || null, barcode: parsed.data.barcode || null,
    description: parsed.data.description, active: true,
  });
  if (error) return { error: error.code === "23505" ? "El SKU, código o nombre ya está en uso." : "No pudimos crear el producto." };
  revalidatePath("/app/products");
  return { success: "Producto creado." };
}

export async function setProductActive(formData: FormData) {
  const parsed = z.object({ productId: z.uuid(), active: z.enum(["true", "false"]) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const organization = await getCurrentOrganization();
  if (!organization) return;
  const supabase = await createClient();
  await supabase.from("products").update({ active: parsed.data.active === "true" }).eq("id", parsed.data.productId).eq("organization_id", organization.id);
  revalidatePath("/app/products");
}

export async function addProductsToEvent(_: PosActionState, formData: FormData): Promise<PosActionState> {
  const parsed = eventProductsSchema.safeParse({ eventId: formData.get("eventId"), productIds: formData.getAll("productIds") });
  if (!parsed.success) return { error: "Elegí al menos un producto." };
  const supabase = await createClient();
  const [{ data: event }, { data: products }] = await Promise.all([
    supabase.from("events").select("organization_id, currency, pos_enabled").eq("id", parsed.data.eventId).single(),
    supabase.from("products").select("id, organization_id, default_price_amount, currency").in("id", parsed.data.productIds).eq("active", true),
  ]);
  if (!event?.pos_enabled || products?.length !== parsed.data.productIds.length || products.some((product) => product.organization_id !== event.organization_id || product.default_price_amount === null || product.currency !== event.currency)) return { error: "Los productos deben estar activos, tener precio y pertenecer a la organización." };
  const { error } = await supabase.from("event_products").upsert(products.map((product, index) => ({
    organization_id: event.organization_id, event_id: parsed.data.eventId, product_id: product.id,
    price_amount: product.default_price_amount!, currency: event.currency, enabled: true, sort_order: index,
  })), { onConflict: "event_id,product_id" });
  if (error) return { error: "No pudimos agregar los productos a esta fecha." };
  revalidatePath(`/app/events/${parsed.data.eventId}/pos`);
  return { success: "Productos agregados." };
}

export async function updateEventProduct(_: PosActionState, formData: FormData): Promise<PosActionState> {
  const parsed = eventProductUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisá el precio." };
  const supabase = await createClient();
  const { error } = await supabase.from("event_products").update({ price_amount: parsed.data.pricePesos * 100, enabled: parsed.data.enabled === "true" }).eq("id", parsed.data.eventProductId).eq("event_id", parsed.data.eventId);
  if (error) return { error: "No pudimos actualizar el producto." };
  revalidatePath(`/app/events/${parsed.data.eventId}/pos`);
  return { success: "Precio actualizado." };
}

export async function createSalesLocation(_: PosActionState, formData: FormData): Promise<PosActionState> {
  const parsed = locationSchema.safeParse({ ...Object.fromEntries(formData), eventProductIds: formData.getAll("eventProductIds") });
  if (!parsed.success) return { error: "Indicá un nombre y al menos un producto." };
  const supabase = await createClient();
  const [{ data: event }, { data: selectedProducts }] = await Promise.all([
    supabase.from("events").select("organization_id, pos_enabled").eq("id", parsed.data.eventId).single(),
    supabase.from("event_products").select("id").eq("event_id", parsed.data.eventId).in("id", parsed.data.eventProductIds),
  ]);
  if (!event?.pos_enabled) return { error: "La función POS no está activa." };
  if (selectedProducts?.length !== parsed.data.eventProductIds.length) return { error: "Los productos elegidos no son válidos para este evento." };
  const locationId = crypto.randomUUID();
  const { error } = await supabase.from("sales_locations").insert({ id: locationId, organization_id: event.organization_id, event_id: parsed.data.eventId, name: parsed.data.name, description: parsed.data.description });
  if (error) return { error: error.code === "23505" ? "Ya existe un punto con ese nombre." : "No pudimos crear el punto de venta." };
  const { error: productsError } = await supabase.from("sales_location_products").insert(parsed.data.eventProductIds.map((eventProductId, index) => ({ sales_location_id: locationId, event_product_id: eventProductId, organization_id: event.organization_id, event_id: parsed.data.eventId, sort_order: index, enabled: true })));
  if (productsError) return { error: "El punto se creó, pero no pudimos asignar sus productos. Volvé a intentarlo." };
  revalidatePath(`/app/events/${parsed.data.eventId}/pos`);
  return { success: "Punto de venta creado." };
}

export async function createPosDevice(_: PosActionState, formData: FormData): Promise<PosActionState> {
  const parsed = deviceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Elegí un punto de venta y un nombre para el dispositivo." };
  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("starts_at, ends_at, status, pos_enabled").eq("id", parsed.data.eventId).single();
  if (!event?.pos_enabled || !["published", "sold_out"].includes(event.status)) return { error: "El evento debe estar publicado y tener POS activo." };
  const operationalEnd = event.ends_at ? new Date(new Date(event.ends_at).getTime() + 4 * 3_600_000) : new Date(new Date(event.starts_at).getTime() + 16 * 3_600_000);
  if (operationalEnd <= new Date()) return { error: "La ventana operativa ya terminó." };
  const codeExpiresAt = new Date(Math.min(Date.now() + 30 * 60_000, operationalEnd.getTime()));
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const pin = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const { error } = await supabase.rpc("create_pos_device_authorization", {
      target_event: parsed.data.eventId, target_location: parsed.data.locationId, device_name: parsed.data.name,
      target_pin: pin, target_code_expires_at: codeExpiresAt.toISOString(), target_session_expires_at: operationalEnd.toISOString(),
    });
    if (!error) { revalidatePath(`/app/events/${parsed.data.eventId}/pos`); return { success: "Dispositivo creado. Copiá el PIN ahora: no volverá a mostrarse.", pin }; }
    if (!error.message.includes("PIN_COLLISION")) return { error: "No pudimos crear el dispositivo." };
  }
  return { error: "No pudimos generar un PIN único. Intentá nuevamente." };
}

export async function revokePosDevice(formData: FormData) {
  const parsed = z.object({ eventId: z.uuid(), deviceId: z.uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const supabase = await createClient();
  await supabase.rpc("revoke_pos_device", { target_authorization: parsed.data.deviceId });
  revalidatePath(`/app/events/${parsed.data.eventId}/pos`);
}
