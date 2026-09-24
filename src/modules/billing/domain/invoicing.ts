export const CBTE_FACTURA_C = 11;
export const CBTE_NOTA_CREDITO_C = 13;

export type IssuerConfig = {
  cuit: string;
  pointOfSale: number;
  legalName: string;
  address: string;
  grossIncomeNumber: string;
  activityStart: string;
};

export type InvoiceDraft = {
  kind: "invoice" | "credit_note";
  orderPublicId: string;
  amountMinor: number;
  currency: string;
  description: string;
  customer: { name: string; document: string | null; email: string };
  relatedDocument: { pointOfSale: number; number: number } | null;
  issuer: IssuerConfig;
};

export type IssuedDocument = {
  pointOfSale: number;
  number: number;
  cbteType: number;
  cae: string;
  caeExpiresAt: string;
  pdfUrl: string | null;
  providerReference: string | null;
};

export interface InvoiceProvider {
  readonly name: string;
  issue(draft: InvoiceDraft): Promise<IssuedDocument>;
}
