import "server-only";

import type { InvoiceProvider, IssuerConfig } from "../domain/invoicing";
import { AfipSdkProvider } from "./afip-sdk-provider";
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

// Never let a fake or test-mode provider touch real buyers: in production the real ARCA provider
// needs the certificate and AFIP_PRODUCTION=true, otherwise invoices stay queued as "pending".
export function getInvoiceProvider(): InvoiceProvider | null {
  const isProduction = process.env.VERCEL_ENV === "production";
  const provider = process.env.INVOICING_PROVIDER;
  if (provider === "sandbox" && !isProduction) return new SandboxInvoiceProvider();
  if (provider === "afipsdk") {
    const accessToken = process.env.AFIP_SDK_ACCESS_TOKEN;
    const issuer = getIssuerConfig();
    if (!accessToken || !issuer) return null;
    const cert = process.env.AFIP_CERT?.replace(/\\n/g, "\n");
    const key = process.env.AFIP_KEY?.replace(/\\n/g, "\n");
    const production = process.env.AFIP_PRODUCTION === "true" && Boolean(cert) && Boolean(key);
    if (isProduction && !production) return null;
    return new AfipSdkProvider({ accessToken, production, cuit: issuer.cuit, cert, key });
  }
  return null;
}
