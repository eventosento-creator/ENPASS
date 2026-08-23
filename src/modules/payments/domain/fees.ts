export type FeePolicy =
  | { payer: "buyer"; bps: number }
  | { payer: "producer"; bps: number }
  | { payer: "mixed"; buyerBps: number; producerBps: number };

export type FeeBreakdown = {
  buyerFeeAmount: number;
  producerFeeAmount: number;
  totalFeeAmount: number;
};

export function calculateFeeBreakdown(subtotalAmount: number, policy: FeePolicy): FeeBreakdown {
  assertMinorUnits(subtotalAmount);

  if (policy.payer === "buyer") {
    const buyerFeeAmount = applyBasisPoints(subtotalAmount, policy.bps);
    return { buyerFeeAmount, producerFeeAmount: 0, totalFeeAmount: buyerFeeAmount };
  }

  if (policy.payer === "producer") {
    const producerFeeAmount = applyBasisPoints(subtotalAmount, policy.bps);
    return { buyerFeeAmount: 0, producerFeeAmount, totalFeeAmount: producerFeeAmount };
  }

  const buyerFeeAmount = applyBasisPoints(subtotalAmount, policy.buyerBps);
  const producerFeeAmount = applyBasisPoints(subtotalAmount, policy.producerBps);
  return {
    buyerFeeAmount,
    producerFeeAmount,
    totalFeeAmount: buyerFeeAmount + producerFeeAmount,
  };
}

export function applyBasisPoints(amount: number, bps: number) {
  assertMinorUnits(amount);
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) {
    throw new RangeError("Los basis points deben estar entre 0 y 10000.");
  }

  return Number((BigInt(amount) * BigInt(bps) + 5_000n) / 10_000n);
}

function assertMinorUnits(amount: number) {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new RangeError("El monto debe ser un entero seguro en unidades mínimas.");
  }
}
