import { getCurrentOrganization } from "@/modules/organizations/application/queries";
import { OnboardingIntentPicker } from "@/modules/organizations/ui/onboarding-intent-picker";
import { OrganizationForm, VenueForm } from "@/modules/organizations/ui/forms";
import { safeProducerPath } from "@/shared/lib/navigation";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ organization?: string; next?: string; intent?: string }> }) {
  const query = await searchParams;
  const current = await getCurrentOrganization();
  const organizationId = query.organization ?? current?.id;
  const nextPath = safeProducerPath(query.next);
  const intent = query.intent === "club" ? "club" : query.intent === "event" ? "event" : undefined;

  if (!organizationId && !intent) {
    return <section className="mx-auto max-w-2xl">
      <p className="eyebrow">Primeros pasos</p>
      <h1 className="mt-3 text-4xl font-black tracking-tight">¿Qué querés hacer en ENPASS?</h1>
      <p className="mt-3 text-neutral-400">Después podés usar las dos cosas igual, esto solo decide por dónde arrancamos.</p>
      <OnboardingIntentPicker nextPath={nextPath}/>
    </section>;
  }

  return <section className="mx-auto max-w-xl"><p className="eyebrow">Primeros pasos</p><h1 className="mt-3 text-4xl font-black tracking-tight">{organizationId ? "¿Dónde ocurre la noche?" : intent === "club" ? "Creá tu club" : "Creá tu espacio"}</h1><p className="mt-3 text-neutral-400">{organizationId ? "Guardá tu primer venue. Después podés crear el evento." : intent === "club" ? "El nombre con el que te van a reconocer tus socios." : "Una organización reúne eventos, lugares y equipo."}</p>{organizationId ? <VenueForm organizationId={organizationId} nextPath={nextPath}/> : <OrganizationForm nextPath={nextPath} intent={intent}/>}</section>;
}
