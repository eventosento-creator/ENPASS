import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, UserRoundCheck } from "lucide-react";
import { getCurrentOrganization } from "@/modules/organizations/application/queries";
import { isClubEnabled, searchMembers, getMembershipCategories } from "@/modules/clubs/application/queries";
import { generateDuesForPeriod } from "@/modules/clubs/application/actions";
import { MemberSearch } from "@/modules/clubs/ui/member-search";
import { MembersImport } from "@/modules/clubs/ui/members-import";
import { ClubBanner } from "@/modules/clubs/ui/club-banner";
import { ClubSectionNav } from "@/modules/clubs/ui/club-section-nav";
import { EmptyState } from "@/shared/ui/empty-state";
import { StatCard } from "@/shared/ui/stat-card";
import { formatMoney } from "@/shared/lib/format";

export default async function MembersPage() {
  const org = await getCurrentOrganization();
  if (!org) redirect("/app/onboarding");
  const enabled = await isClubEnabled(org.id);
  if (!enabled) redirect("/app");

  const [members, categories] = await Promise.all([searchMembers(org.id), getMembershipCategories(org.id)]);
  const activeCount = members.filter((m) => m.membershipStatus === "active").length;
  const overdueCount = members.filter((m) => m.dueStatus === "overdue").length;
  const monthlyExpected = categories.reduce((sum, category) => sum + category.monthly_fee_amount * members.filter((m) => m.categoryName === category.name && m.membershipStatus === "active").length, 0);
  const currentPeriod = defaultCurrentPeriod();

  return <>
    <ClubBanner organizationId={org.id}/>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="eyebrow">Tu club</p><h1 className="page-title mt-2">Socios</h1><p className="mt-3 text-neutral-500">Padrón, cuotas y estado de cada socio.</p></div>
      <Link className="btn btn-primary" href={"/app/socios/nuevo" as never}><Plus size={18}/>Nuevo socio</Link>
    </div>
    <ClubSectionNav active="socios"/>
    {["owner", "admin"].includes(org.role) && <MembersImport/>}

    <section className="mt-6 grid gap-4 sm:grid-cols-3">
      <StatCard icon={UserRoundCheck} tone="emerald" label="Socios activos" value={String(activeCount)}/>
      <StatCard icon={UserRoundCheck} tone="red" label="Con deuda" value={String(overdueCount)} sublabel="Informativo, no bloquea el ingreso"/>
      <StatCard icon={UserRoundCheck} tone="violet" label="Cuota mensual esperada" value={formatMoney(monthlyExpected, org.default_currency)}/>
    </section>

    {categories.length > 0 && <form action={generateDuesForPeriod} className="card mt-6 flex flex-wrap items-end gap-3 p-4">
      <input type="hidden" name="organizationId" value={org.id}/>
      <input type="hidden" name="period" value={currentPeriod}/>
      <p className="text-sm text-neutral-500">Generar la cuota de este mes para todos los socios activos. A cada uno le vence el mismo día del mes en que se dio de alta.</p>
      <button className="btn btn-secondary ml-auto" type="submit">Generar cuotas del mes</button>
    </form>}

    {members.length ? <MemberSearch members={members}/> : <div className="mt-8"><EmptyState icon={UserRoundCheck} title="Todavía no tenés socios cargados" description="Dá de alta al primero o pedinos que carguemos tu padrón existente." action={<Link className="btn btn-primary" href={"/app/socios/nuevo" as never}>Nuevo socio</Link>}/></div>}
  </>;
}

function defaultCurrentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}
