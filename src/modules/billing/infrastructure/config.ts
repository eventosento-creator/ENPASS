import "server-only";

import type { InvoiceProvider, IssuerConfig } from "../domain/invoicing";
import { SandboxInvoiceProvider } from "./sandbox-provider";

export function getIssuerConfig(): IssuerConfig | null {
  const cuit = process.env.ENPASS_CUIT?.replace(/\D/g, "");
  const pointOfSale = Number(process.env.ENPASS_POINT_OF_SALE);
  if (!cuit || cuit.length !== 11 || !Number.isInteger(pointOfSale) || pointOfSale <= 0) return null;
  return {
    cuit,
    pointOfSale,
    legalName: process.env.ENPASS_LEGAL_NAME ?? "",
    address: process.env.ENPASS_ADDRESS ?? "",
    grossIncomeNumber: process.env.ENPASS_GROSS_INCOME ?? "",
    activityStart: process.env.ENPASS_ACTIVITY_START ?? "",
  };
}

// The sandbox provider fabricates CAEs, so it must never run against real buyers. With no real
// provider configured in production, invoices simply stay queued as "pending" until one is.
export function getInvoiceProvider(): InvoiceProvider | null {
  if (process.env.INVOICING_PROVIDER === "sandbox" && process.env.VERCEL_ENV !== "production") return new SandboxInvoiceProvider();
  return null;
}
