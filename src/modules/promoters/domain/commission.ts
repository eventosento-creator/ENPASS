export type CommissionRuleInput =
  | { type: "fixed_per_ticket"; value: number }
  | { type: "percentage"; value: number };

export function calculateCommission(
  rule: CommissionRuleInput,
  input: { unitBaseAmount: number; quantity: number },
) {
  assertNonNegativeInteger(input.unitBaseAmount, "unitBaseAmount");
  assertPositiveInteger(input.quantity, "quantity");
  assertPositiveInteger(rule.value, "commissionValue");

  if (rule.type === "fixed_per_ticket") {
    return rule.value * input.quantity;
  }

  if (rule.value > 10_000) throw new Error("INVALID_COMMISSION_BPS");
  const lineBaseAmount = input.unitBaseAmount * input.quantity;
  return Math.floor((lineBaseAmount * rule.value + 5_000) / 10_000);
}

export function commissionValueFromDisplay(type: CommissionRuleInput["type"], rawValue: number) {
  if (!Number.isFinite(rawValue) || rawValue <= 0) throw new Error("INVALID_COMMISSION_VALUE");
  const value = Math.round(rawValue * 100);
  if (!Number.isSafeInteger(value) || (type === "percentage" && value > 10_000)) {
    throw new Error("INVALID_COMMISSION_VALUE");
  }
  return value;
}

function assertNonNegativeInteger(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`INVALID_${name.toUpperCase()}`);
}

function assertPositiveInteger(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`INVALID_${name.toUpperCase()}`);
}
