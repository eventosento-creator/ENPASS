import { applyBasisPoints } from "@/modules/payments/domain/fees";

export type DuesCharge = {
  /** Cargo de servicio que paga la familia arriba de la cuota. */
  serviceFee: number;
  /** Total que paga la familia. */
  total: number;
  /** Parte de la comisión de Mercado Pago que absorbe ENPASS restándola de su propio cargo (modalidad "el club cobra"). */
  absorbed: number;
  /** marketplace_fee: lo que se separa para ENPASS en el momento del pago. */
  marketplaceFee: number;
};

/**
 * Cuota + cargo de servicio. El club recibe la cuota completa: cobrando en la cuenta del club, Mercado Pago le descuenta su comisión
 * sobre el TOTAL, así que ENPASS se queda con (cargo − comisión estimada) en vez del cargo entero. Cobrando ENPASS no se separa nada.
 */
export function computeDuesCharge(input: { amount: number; feeBps: number; mpAbsorbBps: number; enpassCollects: boolean }): DuesCharge {
  const serviceFee = applyBasisPoints(input.amount, input.feeBps);
  const total = input.amount + serviceFee;
  if (input.enpassCollects || serviceFee === 0) return { serviceFee, total, absorbed: 0, marketplaceFee: 0 };
  // Nunca se absorbe más que el propio cargo (el marketplace_fee no puede ser negativo).
  const absorbed = Math.min(serviceFee, applyBasisPoints(total, input.mpAbsorbBps));
  return { serviceFee, total, absorbed, marketplaceFee: serviceFee - absorbed };
}
