import { redirect } from "next/navigation";
import { getCurrentOrganization } from "@/modules/organizations/application/queries";
import { ProductCatalogManagement } from "@/modules/pos/ui/product-catalog-management";
import { createClient } from "@/shared/database/server";

export default async function ProductsPage() {
  const organization = await getCurrentOrganization();
  if (!organization) redirect("/app/onboarding");
  const supabase = await createClient();
  const [{ data: categories }, { data: products }] = await Promise.all([
    supabase.from("product_categories").select("id, name, active").eq("organization_id", organization.id).order("sort_order").order("name"),
    supabase.from("products").select("id, name, description, category_id, sku, barcode, default_price_amount, currency, active").eq("organization_id", organization.id).order("active", { ascending: false }).order("name"),
  ]);
  return <div className="mx-auto max-w-5xl"><p className="eyebrow">Catálogo de la organización</p><h1 className="page-title mt-2">Productos</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-500">Cargalos una sola vez. Cada evento decide cuáles vende y a qué precio.</p><ProductCatalogManagement categories={categories ?? []} products={products ?? []}/></div>;
}
