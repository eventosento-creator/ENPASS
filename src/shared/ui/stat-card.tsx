import type { LucideIcon } from "lucide-react";
import { IconBadge, type IconBadgeTone } from "./icon-badge";

export function StatCard({ icon, tone = "neutral", label, value, sublabel }: { icon: LucideIcon; tone?: IconBadgeTone; label: string; value: string; sublabel?: string }) {
  return <div className="card p-5">
    <div className="flex items-center gap-3"><IconBadge icon={icon} tone={tone}/><p className="text-xs font-bold uppercase tracking-wider text-neutral-600">{label}</p></div>
    <p className="mt-4 text-2xl font-black">{value}</p>
    {sublabel && <p className="mt-1 text-xs text-neutral-500">{sublabel}</p>}
  </div>;
}
