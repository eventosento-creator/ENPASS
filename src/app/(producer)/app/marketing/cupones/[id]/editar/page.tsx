import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentOrganization } from "@/modules/organizations/application/queries";
import { getPromotion, getPromotionScopeOptions } from "@/modules/promotions/application/queries";
import { isoToLocalInput } from "@/modules/promotions/domain/promotions";
import { PromotionForm } from "@/modules/promotions/ui/promotion-form";

export default async function EditPromotionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const organization = await getCurrentOrganization();
  if (!organization) redirect("/app/onboarding");
  if (!["owner", "admin"].includes(organization.role)) redirect("/app");
  const [found, scope] = await Promise.all([getPromotion(organization.id, id), getPromotionScopeOptions(organization.id)]);
  if (!found) notFound();
  return <div className="mx-auto max-w-3xl">
    <Link href={`/app/marketing/cupones/${id}` as never} className="inline-flex items-center gap-2 text-sm font-bold text-neutral-500 hover:text-white"><ArrowLeft size={16}/>{found.promotion.code}</Link>
    <p className="eyebrow mt-7">Marketing</p><h1 className="page-title mt-2">Editar cupón</h1>
    <p className="mt-3 text-sm leading-6 text-neutral-500">Los cambios valen para las compras nuevas. Las compras ya confirmadas conservan su descuento.</p>
    <div className="mt-8"><PromotionForm organizationId={organization.id} events={scope.events} ticketTypes={scope.ticketTypes} currency={organization.default_currency}
      initial={{ promotion: found.promotion, eventIds: found.eventIds, ticketTypeIds: found.ticketTypeIds, startsAtLocal: isoToLocalInput(found.promotion.starts_at), endsAtLocal: isoToLocalInput(found.promotion.ends_at) }}/></div>
  </div>;
}
