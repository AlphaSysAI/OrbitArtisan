import type {
  CrossIndustryInvoice,
  SupplyChainTradeLineItem,
  TradeParty,
  TradeTax,
} from "./cii-types";
import type { FacturXInvoiceDocument, FacturXLineInput, FacturXProfile } from "./types";

const GUIDELINE_URNS: Record<FacturXProfile, string> = {
  basic: "urn:factur-x.eu:1p0:basic",
  en16931: "urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:en16931",
};

function centsToEuros(cents: number): number {
  return Math.round(cents) / 100;
}

function amount(cents: number, currency = "EUR") {
  return { value: centsToEuros(cents), currencyID: currency };
}

function formatIssueDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function buildAddress(party: FacturXInvoiceDocument["seller"]): TradeParty["postalTradeAddress"] {
  return {
    postcodeCode: party.postalCode ? { value: party.postalCode } : undefined,
    lineOne: party.addressLine1 ? { value: party.addressLine1 } : undefined,
    lineTwo: party.addressLine2 ? { value: party.addressLine2 } : undefined,
    cityName: party.city ? { value: party.city } : undefined,
    countryID: { value: (party.countryCode ?? "FR").toUpperCase() },
  };
}

function buildTradeParty(party: FacturXInvoiceDocument["seller"], profile: FacturXProfile): TradeParty {
  const contacts: TradeParty["definedTradeContact"] = [];
  if (profile === "en16931" && (party.email || party.phone)) {
    contacts.push({
      emailURIUniversalCommunication: party.email
        ? { uriID: { value: `mailto:${party.email}` } }
        : undefined,
      telephoneUniversalCommunication: party.phone ? { completeNumber: { value: party.phone } } : undefined,
    });
  }

  const taxRegs: TradeParty["specifiedTaxRegistration"] = [];
  if (party.vatNumber) {
    taxRegs.push({ id: { value: party.vatNumber } });
  }

  return {
    name: { value: party.name },
    specifiedLegalOrganization:
      party.siret || party.siren
        ? {
            id: {
              value: party.siret ?? party.siren!,
              schemeID: party.siret ? "0009" : "0002",
            },
            tradingBusinessName: party.tradeRegisterNumber
              ? { value: party.tradeRegisterNumber }
              : undefined,
          }
        : undefined,
    definedTradeContact: contacts.length > 0 ? contacts : undefined,
    postalTradeAddress: buildAddress(party),
    specifiedTaxRegistration: taxRegs.length > 0 ? taxRegs : undefined,
  };
}

function buildLineTax(line: FacturXLineInput): TradeTax {
  return {
    calculatedAmount: amount(Math.round((line.lineTotalCents * line.vatRate) / 100)),
    basisAmount: amount(line.lineTotalCents),
    typeCode: { value: "VAT" },
    categoryCode: { value: line.vatCategoryCode },
    rateApplicablePercent: { value: line.vatRate },
    exemptionReason:
      line.vatRate === 0 && line.vatExemptionReason ? { value: line.vatExemptionReason } : undefined,
  };
}

function buildLineItem(line: FacturXLineInput, currency: string): SupplyChainTradeLineItem {
  const unitNetCents =
    line.quantity > 0 ? Math.round(line.lineTotalCents / line.quantity) : line.lineTotalCents;

  return {
    associatedDocumentLineDocument: { lineID: { value: String(line.lineNumber) } },
    specifiedTradeProduct: { name: { value: line.label } },
    specifiedLineTradeAgreement: {
      netPriceProductTradePrice: {
        chargeAmount: amount(unitNetCents, currency),
        basisQuantity: { value: 1, unitCode: "C62" },
      },
    },
    specifiedLineTradeDelivery: {
      billedQuantity: { value: line.quantity, unitCode: "C62" },
    },
    specifiedLineTradeSettlement: {
      applicableTradeTax: [buildLineTax(line)],
      specifiedTradeSettlementLineMonetarySummation: {
        lineTotalAmount: amount(line.lineTotalCents, currency),
      },
    },
  };
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
): CrossIndustryInvoice {
  const currency = doc.currency ?? "EUR";
  const taxGroups = groupTaxes(doc.lines);
  const lineTotalCents = doc.lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
  const taxTotalCents = taxGroups.reduce((sum, group) => sum + group.taxCents, 0);
  const grandTotalCents = lineTotalCents + taxTotalCents;

  const headerTaxes: TradeTax[] = taxGroups.map((group) => ({
    calculatedAmount: amount(group.taxCents, currency),
    basisAmount: amount(group.basisCents, currency),
    typeCode: { value: "VAT" },
    categoryCode: { value: group.vatCategoryCode },
    rateApplicablePercent: { value: group.vatRate },
    exemptionReason:
      group.vatRate === 0 && group.exemptionReason ? { value: group.exemptionReason } : undefined,
  }));

  const notes = doc.notes?.trim() ? [{ content: { value: doc.notes.trim() } }] : undefined;

  // Point 1 audit pré-pilote : typeCode CII porte la nature du document.
  // 380 = facture, 381 = avoir (UN/CEFACT 1001). Les MONTANTS restent
  // POSITIFS dans les deux cas — ce n'est PAS une erreur : selon EN16931,
  // le typeCode seul porte le signal crédit/débit, et négocier les montants
  // en plus du typeCode 381 crée une double négation qui fait échouer la
  // validation sémantique (règle BR-27 notamment) chez la plupart des
  // plateformes de réception, dont potentiellement la Plateforme Agréée.
  // Vérifié via la documentation Peppol/EN16931 (typeCode 381 + montants
  // positifs = convention correcte ; ne pas la changer sans revalider).
  const typeCode = doc.invoiceType === "credit_note" ? "381" : "380";

  return {
    exchangedDocumentContext: {
      guidelineSpecifiedDocumentContextParameter: {
        id: { value: GUIDELINE_URNS[profile] },
      },
    },
    exchangedDocument: {
      id: { value: doc.invoiceNumber },
      typeCode: { value: typeCode },
      issueDateTime: {
        dateTimeString: formatIssueDate(doc.issueDate),
        format: "102",
      },
      includedNote: notes,
    },
    supplyChainTradeTransaction: {
      includedSupplyChainTradeLineItem: doc.lines.map((line) => buildLineItem(line, currency)),
      applicableHeaderTradeAgreement: {
        sellerTradeParty: buildTradeParty(doc.seller, profile),
        buyerTradeParty: buildTradeParty(doc.buyer, profile),
      },
      applicableHeaderTradeDelivery: {},
      applicableHeaderTradeSettlement: {
        invoiceCurrencyCode: { value: currency },
        applicableTradeTax: headerTaxes,
        specifiedTradeSettlementHeaderMonetarySummation: {
          lineTotalAmount: amount(lineTotalCents, currency),
          taxBasisTotalAmount: amount(lineTotalCents, currency),
          taxTotalAmount: [amount(taxTotalCents, currency)],
          grandTotalAmount: amount(grandTotalCents, currency),
          duePayableAmount: amount(grandTotalCents, currency),
        },
      },
    },
  };
}
