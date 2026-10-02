import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentOrganization } from "@/modules/organizations/application/queries";
import { isClubEnabled, getMembershipCategories, getNextMemberNumber } from "@/modules/clubs/application/queries";
import { MemberForm } from "@/modules/clubs/ui/member-form";

export default async function NewMemberPage() {
  const org = await getCurrentOrganization();
  if (!org) redirect("/app/onboarding");
  if (!(await isClubEnabled(org.id))) redirect("/app");

  const [allCategories, suggestedNumber] = await Promise.all([getMembershipCategories(org.id), getNextMemberNumber(org.id)]);
  const categories = allCategories.filter((c) => c.active);

  return <>
    <Link href={"/app/socios" as never} className="inline-flex items-center gap-2 text-sm font-bold text-neutral-500 hover:text-white"><ArrowLeft size={16}/>Volver a Socios</Link>
    <p className="eyebrow mt-7">Tu club</p><h1 className="page-title mt-2">Nuevo socio</h1>
    <p className="mt-3 text-neutral-500">Si la persona ya compró una entrada antes, reutilizamos sus datos automáticamente por DNI o email.</p>
    {categories.length === 0 && <p className="status-warning mt-6 rounded-xl p-4 text-sm">Todavía no tenés categorías activas. <Link href={"/app/socios/categorias" as never} className="font-bold underline">Creá una en Categorías</Link> antes de dar de alta socios.</p>}
    <MemberForm organizationId={org.id} categories={categories.map((c) => ({ id: c.id, name: c.name }))} suggestedNumber={suggestedNumber}/>
  </>;
}
