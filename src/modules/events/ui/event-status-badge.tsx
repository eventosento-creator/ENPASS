import { cn } from "@/shared/lib/cn";
import type { Event } from "@/shared/database/types";

const labels: Record<Event["status"], string> = { draft: "Borrador", published: "Publicado", sold_out: "Agotado", finished: "Finalizado", cancelled: "Cancelado" };
const styles: Record<Event["status"], string> = {
  draft: "border-white/12 bg-black/55 text-white/75",
  published: "border-lime-300/25 bg-lime-300/12 text-lime-200",
  sold_out: "border-red-300/25 bg-red-300/12 text-red-200",
  finished: "border-white/10 bg-white/8 text-white/50",
  cancelled: "border-orange-300/25 bg-orange-300/12 text-orange-200",
};

export function EventStatusBadge({ status, className }: { status: Event["status"]; className?: string }) {
  return <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.1em] backdrop-blur", styles[status], className)}>{labels[status]}</span>;
}
