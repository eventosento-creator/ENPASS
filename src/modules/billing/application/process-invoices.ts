import "server-only";

import { createAdminClient } from "@/shared/database/admin";
import { formatMoney } from "@/shared/lib/format";
import { ticketingLog } from "@/shared/lib/structured-log";
import { SmtpEmailProvider } from "@/modules/ticketing/infrastructure/smtp-email-provider";
import type { Invoice } from "@/shared/database/types";
import { getInvoiceProvider, getIssuerConfig } from "../infrastructure/config";

const MAX_ATTEMPTS = 8;
const STUCK_AFTER_MS = 10 * 60_000;

// Issues every due invoice/credit note (optionally only for one order). Safe to call from the
// webhook and from the cron: rows are claimed with a compare-and-set before calling the provider.
export async function processPendingInvoices(options: { orderId?: string; limit?: number } = {}) {
  const provider = getInvoiceProvider();
  const issuer = getIssuerConfig();
  if (!provider || !issuer) return { processed: 0, skipped: "no-provider" as const };

  const admin = createAdminClient();
  const now = new Date();
  const stuckBefore = new Date(now.getTime() - STUCK_AFTER_MS).toISOString();
  let query = admin.from("invoices").select("*")
    .or(`status.eq.pending,and(status.eq.processing,updated_at.lt.${stuckBefore})`)
    .lte("next_attempt_at", now.toISOString())
    .order("kind", { ascending: true }) // "credit_note" sorts before "invoice"; the related-invoice check below handles order
    .order("created_at", { ascending: true })
    .limit(options.limit ?? 25);
  if (options.orderId) query = query.eq("order_id", options.orderId);
  const { data: due, error: queryError } = await query;
  if (queryError) throw new Error(`INVOICE_QUEUE_QUERY_FAILED: ${queryError.message}`);

  let processed = 0;
  for (const candidate of (due ?? []).sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "invoice" ? -1 : 1))) {
    let related: Invoice | null = null;
    if (candidate.kind === "credit_note") {
      const { data } = await admin.from("invoices").select("*").eq("id", candidate.related_invoice_id ?? "").single();
      related = data;
      if (!related || related.status !== "issued" || related.invoice_number === null || related.point_of_sale === null) continue;
    }

    const claim = await admin.from("invoices").update({ status: "processing", attempts: candidate.attempts + 1 })
      .eq("id", candidate.id).eq("updated_at", candidate.updated_at).in("status", ["pending", "processing"]).select("id");
    if (!claim.data?.length) continue;

    try {
      const { data: order } = await admin.from("orders").select("public_id").eq("id", candidate.order_id).single();
      const issued = await provider.issue({
        kind: candidate.kind,
        orderPublicId: order?.public_id ?? candidate.order_id,
        amountMinor: candidate.amount,
        currency: candidate.currency,
        description: candidate.description,
        customer: { name: candidate.customer_name, document: candidate.customer_document, email: candidate.customer_email },
        relatedDocument: related ? { pointOfSale: related.point_of_sale as number, number: related.invoice_number as number } : null,
        issuer,
      });
      await admin.from("invoices").update({
        status: "issued", issuer_cuit: issued.issuerCuit ?? issuer.cuit, point_of_sale: issued.pointOfSale, cbte_type: issued.cbteType,
        invoice_number: issued.number, cae: issued.cae, cae_expires_at: issued.caeExpiresAt, issued_at: new Date().toISOString(),
        pdf_url: issued.pdfUrl, provider: provider.name, provider_reference: issued.providerReference, last_error: null,
      }).eq("id", candidate.id);
      ticketingLog("invoice.issued", { invoiceId: candidate.id, orderId: candidate.order_id, kind: candidate.kind });
      processed += 1;
      await emailInvoice(candidate.id);
    } catch (error) {
      const message = (error instanceof Error ? error.message : "unknown").slice(0, 300);
      const attempts = candidate.attempts + 1;
      const backoffMinutes = Math.min(2 ** attempts, 720);
      await admin.from("invoices").update({
        status: attempts >= MAX_ATTEMPTS ? "error" : "pending",
        last_error: message,
        next_attempt_at: new Date(Date.now() + backoffMinutes * 60_000).toISOString(),
      }).eq("id", candidate.id);
      ticketingLog("invoice.failed", { invoiceId: candidate.id, orderId: candidate.order_id, attempts, errorCode: message.slice(0, 80) });
    }
  }
  return { processed, skipped: null };
}

async function emailInvoice(invoiceId: string) {
  const admin = createAdminClient();
  const { data: invoice } = await admin.from("invoices").select("*").eq("id", invoiceId).single();
  if (!invoice || invoice.status !== "issued" || invoice.emailed_at || !invoice.customer_email) return;
  try {
    const documentNumber = `${String(invoice.point_of_sale).padStart(5, "0")}-${String(invoice.invoice_number).padStart(8, "0")}`;
    await new SmtpEmailProvider().sendInvoice({
      to: invoice.customer_email,
      kind: invoice.kind,
      description: invoice.description,
      amountLabel: formatMoney(invoice.amount, invoice.currency),
      documentNumber,
      cae: invoice.cae ?? "",
      pdfUrl: invoice.pdf_url,
    });
    await admin.from("invoices").update({ emailed_at: new Date().toISOString() }).eq("id", invoiceId);
  } catch (error) {
    ticketingLog("invoice.email.failed", { invoiceId, errorCode: error instanceof Error ? error.message.slice(0, 80) : "unknown" });
  }
}
