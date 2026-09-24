import { CBTE_FACTURA_C, CBTE_NOTA_CREDITO_C, type InvoiceDraft, type InvoiceProvider, type IssuedDocument } from "../domain/invoicing";

export class SandboxInvoiceProvider implements InvoiceProvider {
  readonly name = "sandbox";

  async issue(draft: InvoiceDraft): Promise<IssuedDocument> {
    const due = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    return {
      pointOfSale: draft.issuer.pointOfSale,
      number: Math.floor(Date.now() / 1000) % 100_000_000,
      cbteType: draft.kind === "invoice" ? CBTE_FACTURA_C : CBTE_NOTA_CREDITO_C,
      cae: String(Math.floor(Math.random() * 1e14)).padStart(14, "0"),
      caeExpiresAt: due,
      pdfUrl: null,
      providerReference: `sandbox-${draft.orderPublicId}`,
    };
  }
}
