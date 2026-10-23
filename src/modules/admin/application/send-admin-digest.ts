import "server-only";

import { createAdminClient } from "@/shared/database/admin";
import { formatMoney } from "@/shared/lib/format";
import { paymentLog } from "@/shared/lib/structured-log";
import { SmtpEmailProvider } from "@/modules/ticketing/infrastructure/smtp-email-provider";

type Digest = {
  transfers_review: number; oldest_transfer_hours: number; listings_pending: number; payouts_to_pay: number; payouts_ready: number;
  conflicts: number; owed_total: number; sales_yesterday: number; fees_yesterday: number;
};

/** Mail diario a ENPASS con lo que espera una acción. Si no hay nada pendiente no manda nada (evita ruido). */
export async function sendAdminDigest() {
  try {
    const { data } = await createAdminClient().rpc("admin_pending_digest");
    const digest = data as Digest | null;
    if (!digest) return { sent: false, reason: "no_data" as const };
    const items = [
      { label: digest.oldest_transfer_hours >= 12 ? `Transferencias para revisar (la más vieja espera ${digest.oldest_transfer_hours} h)` : "Transferencias para revisar", count: digest.transfers_review },
      { label: "Clubes que piden publicarse", count: digest.listings_pending },
      { label: "Liquidaciones para pagar", count: digest.payouts_to_pay },
      { label: "Productores con eventos terminados para liquidar", count: digest.payouts_ready },
      { label: "Pagos con conflicto", count: digest.conflicts },
    ].filter((item) => item.count > 0);
    if (!items.length) return { sent: false, reason: "nothing_pending" as const };
    const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
    if (!appUrl) throw new Error("APP_URL_NOT_CONFIGURED");
    await new SmtpEmailProvider().sendAdminDigest({
      to: process.env.PLATFORM_NOTIFY_EMAIL ?? "enpass.gf@gmail.com",
      items,
      salesYesterdayLabel: formatMoney(digest.sales_yesterday),
      feesYesterdayLabel: formatMoney(digest.fees_yesterday),
      owedLabel: digest.owed_total > 0 ? formatMoney(digest.owed_total) : null,
      adminUrl: new URL("/admin", appUrl).toString(),
    });
    return { sent: true as const, items: items.length };
  } catch (error) {
    paymentLog("admin.digest.failed", { message: error instanceof Error ? error.message : String(error) });
    return { sent: false, reason: "error" as const };
  }
}
