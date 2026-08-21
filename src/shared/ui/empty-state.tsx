import type { LucideIcon } from "lucide-react";

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: React.ReactNode }) {
  return <div className="card grid place-items-center px-6 py-12 text-center"><div className="grid size-12 place-items-center rounded-2xl bg-white/[.06]"><Icon className="text-white/55" size={22}/></div><h2 className="mt-5 text-xl font-bold">{title}</h2><p className="mt-2 max-w-sm text-sm leading-6 text-neutral-500">{description}</p>{action && <div className="mt-6">{action}</div>}</div>;
}
