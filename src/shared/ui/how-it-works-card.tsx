import type { LucideIcon } from "lucide-react";

export function HowItWorksCard({ title = "Cómo funciona", steps, action, layout = "row" }: { title?: string; steps: { icon: LucideIcon; title: string; description: string }[]; action?: React.ReactNode; layout?: "row" | "column" }) {
  return <div className="card p-5 sm:p-6">
    <div className="flex items-center justify-between gap-4"><h2 className="section-title">{title}</h2>{action}</div>
    <div className={`mt-5 grid gap-5 ${layout === "column" ? "" : steps.length >= 4 ? "sm:grid-cols-2 lg:grid-cols-4" : steps.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
      {steps.map((step, index) => <div className="flex gap-3" key={step.title}>
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-sm font-black text-[var(--on-accent)]">{index + 1}</span>
        <div><p className="flex items-center gap-1.5 text-sm font-bold"><step.icon size={14} className="text-[var(--accent)]"/>{step.title}</p><p className="mt-1 text-xs leading-5 text-neutral-500">{step.description}</p></div>
      </div>)}
    </div>
  </div>;
}
