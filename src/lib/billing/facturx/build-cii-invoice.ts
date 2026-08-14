import {
  AmountType,
  CodeType,
  CountryIDType,
  CrossIndustryInvoiceType,
  CurrencyCodeType,
  DateTimeType,
  DocumentCodeType,
  DocumentContextParameterType,
  DocumentLineDocumentType,
  ExchangedDocumentContextType,
  ExchangedDocumentType,
  HeaderTradeAgreementType,
  HeaderTradeDeliveryType,
  HeaderTradeSettlementType,
  IDType,
  LegalOrganizationType,
  LineTradeAgreementType,
  LineTradeDeliveryType,
  LineTradeSettlementType,
  NoteType,
  QuantityType,
  SupplyChainTradeLineItemType,
  SupplyChainTradeTransactionType,
  TaxCategoryCodeType,
  TaxRegistrationType,
  TaxTypeCodeType,
  TextType,
  TradeAddressType,
  TradeContactType,
  TradePartyType,
  TradePriceType,
  TradeProductType,
  TradeSettlementHeaderMonetarySummationType,
  TradeSettlementLineMonetarySummationType,
  TradeTaxType,
  UniversalCommunicationType,
} from "@stafyniaksacha/facturx/models";

import type { FacturXInvoiceDocument, FacturXLineInput, FacturXProfile } from "./types";

const GUIDELINE_URNS: Record<FacturXProfile, string> = {
  basic: "urn:factur-x.eu:1p0:basic",
  en16931: "urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:en16931",
};

function centsToEuros(cents: number): number {
  return Math.round(cents) / 100;
}

function amount(cents: number, currency = "EUR"): AmountType {
  return new AmountType({ value: centsToEuros(cents), currencyID: currency });
}

function formatIssueDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function buildAddress(party: FacturXInvoiceDocument["seller"]): TradeAddressType {
  return new TradeAddressType({
    postcodeCode: party.postalCode ? new CodeType({ value: party.postalCode }) : undefined,
    lineOne: party.addressLine1 ? new TextType({ value: party.addressLine1 }) : undefined,
    lineTwo: party.addressLine2 ? new TextType({ value: party.addressLine2 }) : undefined,
    cityName: party.city ? new TextType({ value: party.city }) : undefined,
    countryID: new CountryIDType({ value: (party.countryCode ?? "FR").toUpperCase() }),
  });
}

function buildTradeParty(party: FacturXInvoiceDocument["seller"], profile: FacturXProfile): TradePartyType {
  const contacts: TradeContactType[] = [];
  if (profile === "en16931" && (party.email || party.phone)) {
    contacts.push(
      new TradeContactType({
        emailURIUniversalCommunication: party.email
          ? new UniversalCommunicationType({ uriID: new IDType({ value: `mailto:${party.email}` }) })
          : undefined,
        telephoneUniversalCommunication: party.phone
          ? new UniversalCommunicationType({ completeNumber: new TextType({ value: party.phone }) })
          : undefined,
      }),
    );
  }

  const taxRegs: TaxRegistrationType[] = [];
  if (party.vatNumber) {
    taxRegs.push(new TaxRegistrationType({ id: new IDType({ value: party.vatNumber }) }));
  }

  return new TradePartyType({
    name: new TextType({ value: party.name }),
    specifiedLegalOrganization:
      party.siret || party.siren
        ? new LegalOrganizationType({
            id: new IDType({
              value: party.siret ?? party.siren!,
              schemeID: party.siret ? "0009" : "0002",
            }),
            tradingBusinessName: party.tradeRegisterNumber
              ? new TextType({ value: party.tradeRegisterNumber })
              : undefined,
          })
        : undefined,
    definedTradeContact: contacts.length > 0 ? contacts : undefined,
    postalTradeAddress: buildAddress(party),
    specifiedTaxRegistration: taxRegs.length > 0 ? taxRegs : undefined,
  });
}

function buildLineTax(line: FacturXLineInput): TradeTaxType {
  const tax = new TradeTaxType({
    typeCode: new TaxTypeCodeType({ value: "VAT" }),
    categoryCode: new TaxCategoryCodeType({ value: line.vatCategoryCode }),
    rateApplicablePercent: { value: line.vatRate },
  });

  if (line.vatRate === 0 && line.vatExemptionReason) {
    tax.exemptionReason = new TextType({ value: line.vatExemptionReason });
  }

  return tax;
}

function buildLineItem(line: FacturXLineInput, currency: string): SupplyChainTradeLineItemType {
  const unitNetCents =
    line.quantity > 0 ? Math.round(line.lineTotalCents / line.quantity) : line.lineTotalCents;

  return new SupplyChainTradeLineItemType({
    associatedDocumentLineDocument: new DocumentLineDocumentType({
      lineID: new IDType({ value: String(line.lineNumber) }),
    }),
    specifiedTradeProduct: new TradeProductType({
      name: new TextType({ value: line.label }),
    }),
    specifiedLineTradeAgreement: new LineTradeAgreementType({
      netPriceProductTradePrice: new TradePriceType({
        chargeAmount: amount(unitNetCents, currency),
        basisQuantity: new QuantityType({ value: 1, unitCode: "C62" }),
      }),
    }),
    specifiedLineTradeDelivery: new LineTradeDeliveryType({
      billedQuantity: new QuantityType({ value: line.quantity, unitCode: "C62" }),
    }),
    specifiedLineTradeSettlement: new LineTradeSettlementType({
      applicableTradeTax: [buildLineTax(line)],
      specifiedTradeSettlementLineMonetarySummation: new TradeSettlementLineMonetarySummationType({
        lineTotalAmount: amount(line.lineTotalCents, currency),
      }),
    }),
  });
}

type TaxGroup = {
  vatRate: number;
  vatCategoryCode: string;
  basisCents: number;
  taxCents: number;
  exemptionReason?: string | null;
};

function groupTaxes(lines: FacturXLineInput[]): TaxGroup[] {
  const map = new Map<string, TaxGroup>();

  for (const line of lines) {
    const key = `${line.vatCategoryCode}:${line.vatRate}`;
    const taxCents = Math.round((line.lineTotalCents * line.vatRate) / 100);
    const existing = map.get(key);

    if (existing) {
      existing.basisCents += line.lineTotalCents;
      existing.taxCents += taxCents;
    } else {
      map.set(key, {
        vatRate: line.vatRate,
        vatCategoryCode: line.vatCategoryCode,
        basisCents: line.lineTotalCents,
        taxCents,
        exemptionReason: line.vatExemptionReason,
      });
    }
  }

  return [...map.values()];
}

/** Construit le modèle Cross Industry Invoice (CII D22B) depuis nos données métier. */
export function buildCrossIndustryInvoice(
  doc: FacturXInvoiceDocument,
  profile: FacturXProfile,
): CrossIndustryInvoiceType {
  const currency = doc.currency ?? "EUR";
  const taxGroups = groupTaxes(doc.lines);
  const lineTotalCents = doc.lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
  const taxTotalCents = taxGroups.reduce((sum, group) => sum + group.taxCents, 0);
  const grandTotalCents = lineTotalCents + taxTotalCents;

  const headerTaxes = taxGroups.map(
    (group) =>
      new TradeTaxType({
        calculatedAmount: amount(group.taxCents, currency),
        basisAmount: amount(group.basisCents, currency),
        typeCode: new TaxTypeCodeType({ value: "VAT" }),
        categoryCode: new TaxCategoryCodeType({ value: group.vatCategoryCode }),
        rateApplicablePercent: { value: group.vatRate },
        exemptionReason:
          group.vatRate === 0 && group.exemptionReason
            ? new TextType({ value: group.exemptionReason })
            : undefined,
      }),
  );

  const notes: NoteType[] = [];
  if (doc.notes?.trim()) {
    notes.push(new NoteType({ content: new TextType({ value: doc.notes.trim() }) }));
  }

  return new CrossIndustryInvoiceType({
    exchangedDocumentContext: new ExchangedDocumentContextType({
      guidelineSpecifiedDocumentContextParameter: new DocumentContextParameterType({
        id: new IDType({ value: GUIDELINE_URNS[profile] }),
      }),
    }),
    exchangedDocument: new ExchangedDocumentType({
      id: new IDType({ value: doc.invoiceNumber }),
      typeCode: new DocumentCodeType({ value: "380" }),
      issueDateTime: new DateTimeType({
        dateTimeString: formatIssueDate(doc.issueDate),
        format: "102",
      }),
      includedNote: notes.length > 0 ? notes : undefined,
    }),
    supplyChainTradeTransaction: new SupplyChainTradeTransactionType({
      includedSupplyChainTradeLineItem: doc.lines.map((line) => buildLineItem(line, currency)),
      applicableHeaderTradeAgreement: new HeaderTradeAgreementType({
        sellerTradeParty: buildTradeParty(doc.seller, profile),
        buyerTradeParty: buildTradeParty(doc.buyer, profile),
      }),
      applicableHeaderTradeDelivery: new HeaderTradeDeliveryType({}),
      applicableHeaderTradeSettlement: new HeaderTradeSettlementType({
        invoiceCurrencyCode: new CurrencyCodeType({ value: currency }),
        applicableTradeTax: headerTaxes,
        specifiedTradeSettlementHeaderMonetarySummation: new TradeSettlementHeaderMonetarySummationType({
          lineTotalAmount: amount(lineTotalCents, currency),
          taxBasisTotalAmount: amount(lineTotalCents, currency),
          taxTotalAmount: [amount(taxTotalCents, currency)],
          grandTotalAmount: amount(grandTotalCents, currency),
          duePayableAmount: amount(grandTotalCents, currency),
        }),
      }),
    }),
  });
}
