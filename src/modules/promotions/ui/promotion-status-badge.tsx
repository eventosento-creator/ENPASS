import { promotionStatusLabels, redemptionStatusLabels } from "../domain/promotions";
import type { PromotionStatus } from "@/shared/database/types";

const tones: Record<PromotionStatus, string> = {
  active: "status-success", inactive: "text-neutral-500", expired: "status-danger", scheduled: "text-sky-500", exhausted: "status-danger",
};

export function PromotionStatusBadge({ status }: { status: PromotionStatus }) {
  return <span className={`inline-flex rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] font-bold ${tones[status]}`}>{promotionStatusLabels[status]}</span>;
}

const redemptionTones: Record<string, string> = { confirmed: "status-success", reserved: "text-amber-500", released: "text-neutral-500", refunded: "status-danger" };

export function RedemptionStatusBadge({ status }: { status: string }) {
  return <span className={`inline-flex rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] font-bold ${redemptionTones[status] ?? "text-neutral-500"}`}>{redemptionStatusLabels[status] ?? status}</span>;
}
