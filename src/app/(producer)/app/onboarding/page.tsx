import { getCurrentOrganization } from "@/modules/organizations/application/queries";
import { OrganizationForm, VenueForm } from "@/modules/organizations/ui/forms";
import { safeProducerPath } from "@/shared/lib/navigation";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ organization?: string; next?: string }> }) {
  const query = await searchParams;
  const current = await getCurrentOrganization();
  const organizationId = query.organization ?? current?.id;
  const nextPath = safeProducerPath(query.next);
  return <section className="mx-auto max-w-xl"><p className="eyebrow">Primeros pasos</p><h1 className="mt-3 text-4xl font-black tracking-tight">{organizationId ? "¿Dónde ocurre la noche?" : "Creá tu espacio"}</h1><p className="mt-3 text-neutral-400">{organizationId ? "Guardá tu primer venue. Después podés crear el evento." : "Una organización reúne eventos, lugares y equipo."}</p>{organizationId ? <VenueForm organizationId={organizationId} nextPath={nextPath}/> : <OrganizationForm nextPath={nextPath}/>}</section>;
}
