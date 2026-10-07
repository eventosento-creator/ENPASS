import { formatMoney } from "@/shared/lib/format";

export type MembershipPlanKind = "standard" | "family" | "scholarship";
export type MembershipPlanMode = "none" | "percent" | "fixed";

export type MembershipPlan = {
  id: string;
  name: string;
  kind: MembershipPlanKind;
  mode: MembershipPlanMode;
  discountBps: number;
  fixedAmount: number;
  active: boolean;
  memberCount: number;
};

export const planKindLabels: Record<MembershipPlanKind, string> = { standard: "Estándar", family: "Familiar", scholarship: "Becado / bonificado" };

/** Precio final de una cuota según el plan (misma regla que la base de datos: apply_membership_plan). */
export function applyPlan(baseAmount: number, plan: Pick<MembershipPlan, "mode" | "discountBps" | "fixedAmount"> | null | undefined) {
  if (!plan) return baseAmount;
  if (plan.mode === "percent") return Math.round(baseAmount * (10_000 - plan.discountBps) / 10_000);
  if (plan.mode === "fixed") return plan.fixedAmount;
  return baseAmount;
}

/** Explicación corta de lo que hace el plan. */
export function describePlan(plan: Pick<MembershipPlan, "mode" | "discountBps" | "fixedAmount">, currency = "ARS") {
  if (plan.mode === "percent") return plan.discountBps >= 10_000 ? "100% de descuento: no paga cuota" : `${plan.discountBps / 100}% de descuento en cada cuota`;
  if (plan.mode === "fixed") return plan.fixedAmount === 0 ? "Cuota en $0: no paga" : `${formatMoney(plan.fixedAmount, currency)} por cada cuota`;
  return "Paga la cuota completa";
}
