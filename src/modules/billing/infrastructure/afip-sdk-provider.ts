import "server-only";

import Afip from "@afipsdk/afip.js";
import { CBTE_FACTURA_C, CBTE_NOTA_CREDITO_C, type InvoiceDraft, type InvoiceProvider, type IssuedDocument } from "../domain/invoicing";

// ARCA table values: DocTipo 96 = DNI, 99 = consumidor final sin identificar; IVA receptor 5 = Consumidor Final.
const DOC_TYPE_DNI = 96;
const DOC_TYPE_ANONYMOUS = 99;
const IVA_CONDITION_FINAL_CONSUMER = 5;
// Afip SDK's public testing CUIT, used when no production certificate is configured.
const HOMOLOGATION_CUIT = 20409378472;

export type AfipSdkConfig = { accessToken: string; production: boolean; cuit: string; cert?: string; key?: string };

export class AfipSdkProvider implements InvoiceProvider {
  readonly name: string;

  constructor(private readonly config: AfipSdkConfig) {
    this.name = config.production ? "afipsdk" : "afipsdk-homologation";
  }

  async issue(draft: InvoiceDraft): Promise<IssuedDocument> {
    const { production, accessToken, cuit, cert, key } = this.config;
    const afip = new Afip(production
      ? { CUIT: Number(cuit), access_token: accessToken, cert, key, production: true }
      : { CUIT: HOMOLOGATION_CUIT, access_token: accessToken });

    const pointOfSale = production ? draft.issuer.pointOfSale : 1;
    const cbteType = draft.kind === "invoice" ? CBTE_FACTURA_C : CBTE_NOTA_CREDITO_C;
    const total = Number((draft.amountMinor / 100).toFixed(2));
    const today = argentinaDate();
    const document = draft.customer.document?.replace(/\D/g, "") ?? "";
    const identified = /^\d{7,8}$/.test(document);

    const data: Record<string, unknown> = {
      CantReg: 1,
      PtoVta: pointOfSale,
      CbteTipo: cbteType,
      Concepto: 2,
      DocTipo: identified ? DOC_TYPE_DNI : DOC_TYPE_ANONYMOUS,
      DocNro: identified ? Number(document) : 0,
      CbteFch: today,
      FchServDesde: today,
      FchServHasta: today,
      FchVtoPago: today,
      ImpTotal: total,
      ImpTotConc: 0,
      ImpNeto: total,
      ImpOpEx: 0,
      ImpIVA: 0,
      ImpTrib: 0,
      MonId: draft.currency === "ARS" ? "PES" : draft.currency,
      MonCotiz: 1,
      CondicionIVAReceptorId: IVA_CONDITION_FINAL_CONSUMER,
    };
    if (draft.kind === "credit_note") {
      if (!draft.relatedDocument) throw new Error("CREDIT_NOTE_WITHOUT_RELATED_INVOICE");
      data.CbtesAsoc = [{ Tipo: CBTE_FACTURA_C, PtoVta: draft.relatedDocument.pointOfSale, Nro: draft.relatedDocument.number }];
    }

    const result = await afip.ElectronicBilling.createNextVoucher(data);
    if (!result?.CAE || !result?.voucher_number) throw new Error("AFIP_EMPTY_VOUCHER_RESPONSE");
    return {
      pointOfSale,
      number: Number(result.voucher_number),
      cbteType,
      cae: String(result.CAE),
      caeExpiresAt: String(result.CAEFchVto),
      pdfUrl: null,
      providerReference: null,
      issuerCuit: production ? cuit : String(HOMOLOGATION_CUIT),
    };
  }
}

function argentinaDate() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return Number(parts.replace(/-/g, ""));
}
