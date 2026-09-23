import Link from "next/link";
import { Check } from "lucide-react";

export type OnboardingStep = {
  title: string;
  description: string;
  href: Parameters<typeof Link>[0]["href"];
  done: boolean;
  cta: string;
};

export function OnboardingChecklist({ steps }: { steps: OnboardingStep[] }) {
  const doneCount = steps.filter(step => step.done).length;
  return <section className="card mt-10 overflow-hidden">
    <div className="flex items-center justify-between gap-4 border-b border-white/[.07] p-5 sm:p-6">
      <div><h2 className="section-title">Primeros pasos</h2><p className="mt-1 text-sm text-neutral-500">Preparemos tu primer evento para la venta.</p></div>
      <span className="shrink-0 rounded-full border border-white/[.08] px-3 py-1.5 text-xs font-bold text-neutral-500">{doneCount}/{steps.length}</span>
    </div>
    <div className="divide-y divide-white/[.07]">
      {steps.map((step, index) => <div key={step.title} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
        <div className="flex items-center gap-4"><span aria-hidden className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-black ${step.done ? "bg-lime-300/[.12] text-lime-300" : "bg-[var(--accent)] text-[var(--on-accent)]"}`}>{step.done ? <Check size={16}/> : index + 1}</span>
          <div className="min-w-0 flex-1"><p className="text-sm font-bold">{step.title}</p><p className="mt-1 text-xs leading-5 text-neutral-500">{step.description}</p></div>
        </div>
        {!step.done && <Link href={step.href} className="btn btn-secondary shrink-0 sm:ml-auto">{step.cta}</Link>}
      </div>)}
    </div>
  </section>;
}
