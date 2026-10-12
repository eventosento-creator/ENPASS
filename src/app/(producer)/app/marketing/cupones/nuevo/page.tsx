import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentOrganization } from "@/modules/organizations/application/queries";
import { getPromotionScopeOptions } from "@/modules/promotions/application/queries";
import { PromotionForm } from "@/modules/promotions/ui/promotion-form";

export default async function NewPromotionPage() {
  const organization = await getCurrentOrganization();
  if (!organization) redirect("/app/onboarding");
  if (!["owner", "admin"].includes(organization.role)) redirect("/app");
  const scope = await getPromotionScopeOptions(organization.id);
  return <div className="mx-auto max-w-3xl">
    <Link href={"/app/marketing/cupones" as never} className="inline-flex items-center gap-2 text-sm font-bold text-neutral-500 hover:text-white"><ArrowLeft size={16}/>Cupones y promociones</Link>
    <p className="eyebrow mt-7">Marketing</p><h1 className="page-title mt-2">Nuevo cupón</h1>
    <div className="mt-8"><PromotionForm organizationId={organization.id} events={scope.events} ticketTypes={scope.ticketTypes} currency={organization.default_currency}/></div>
  </div>;
}
