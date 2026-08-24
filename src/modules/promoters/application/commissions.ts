import "server-only";

import { createAdminClient } from "@/shared/database/admin";
import { promoterLog } from "@/shared/lib/structured-log";

export async function reconcilePromoterCommissionsForOrder(orderId: string) {
  const { data, error } = await createAdminClient().rpc("calculate_promoter_commissions_for_order", {
    target_order: orderId,
  });
  if (error) {
    promoterLog("promoter.commission.failed", { orderId, reason: "calculation_failed" });
    throw new Error("PROMOTER_COMMISSION_RECONCILIATION_FAILED");
  }
  promoterLog(data > 0 ? "promoter.commission.confirmed" : "promoter.commission.calculated", {
    orderId,
    created: data,
  });
  return data;
}
