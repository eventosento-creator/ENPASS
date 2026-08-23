export type PaymentStatus =
  | "pending"
  | "processing"
  | "approved"
  | "rejected"
  | "cancelled"
  | "refunded"
  | "partially_refunded"
  | "charged_back"
  | "approved_inventory_conflict"
  | "approved_duplicate_charge"
  | "error";

export type ProviderPaymentStatus = Exclude<
  PaymentStatus,
  "approved_inventory_conflict" | "approved_duplicate_charge" | "error"
>;

export function mapMercadoPagoStatus(status: string, refundedAmount: number, grossAmount: number): ProviderPaymentStatus {
  switch (status.trim().toLowerCase()) {
    case "pending":
      return "pending";
    case "in_process":
    case "in_mediation":
    case "authorized":
      return "processing";
    case "approved":
      return "approved";
    case "rejected":
      return "rejected";
    case "cancelled":
    case "canceled":
      return "cancelled";
    case "refunded":
      return refundedAmount > 0 && refundedAmount < grossAmount ? "partially_refunded" : "refunded";
    case "partially_refunded":
      return "partially_refunded";
    case "charged_back":
      return "charged_back";
    default:
      return "processing";
  }
}

export function isPaymentTerminal(status: PaymentStatus) {
  return [
    "approved",
    "rejected",
    "cancelled",
    "refunded",
    "charged_back",
    "approved_inventory_conflict",
    "approved_duplicate_charge",
    "error",
  ].includes(status);
}
