import { computeInvoiceTotals, invoiceLineTaxCents } from "../invoice-amounts";
import type {
  CrossIndustryInvoice,
  SupplyChainTradeLineItem,
  TradeParty,
  TradeTax,
} from "./cii-types";
import type { FacturXInvoiceDocument, FacturXLineInput, FacturXProfile } from "./types";
import { uneceUnitCode } from "@/lib/quotes/material-unit";

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
    calculatedAmount: amount(invoiceLineTaxCents(line.lineTotalCents, line.vatRate)),
    basisAmount: amount(line.lineTotalCents),
    typeCode: { value: "VAT" },
    categoryCode: { value: line.vatCategoryCode },
    rateApplicablePercent: { value: line.vatRate },
    exemptionReason:
      line.vatRate === 0 && line.vatExemptionReason ? { value: line.vatExemptionReason } : undefined,
  };
}

/**
 * Prix net unitaire (BT-146) : prix enregistré si cohérent avec le montant de ligne
 * (quantité × prix arrondi au centime = montant), sinon montant ÷ quantité.
 */
export function lineUnitNetCents(line: FacturXLineInput): number {
  if (!(line.quantity > 0)) return line.lineTotalCents;
  const stored = line.unitPriceCents;
  if (stored != null && stored >= 0 && Math.round(Number((line.quantity * stored).toFixed(6))) === line.lineTotalCents) {
    return stored;
  }
  return Math.round(line.lineTotalCents / line.quantity);
}

function buildLineItem(line: FacturXLineInput, currency: string): SupplyChainTradeLineItem {
  const unitNetCents = lineUnitNetCents(line);

  return {
    associatedDocumentLineDocument: { lineID: { value: String(line.lineNumber) } },
    specifiedTradeProduct: { name: { value: line.label } },
    specifiedLineTradeAgreement: {
      netPriceProductTradePrice: {
        chargeAmount: amount(unitNetCents, currency),
        basisQuantity: { value: 1, unitCode: uneceUnitCode(line.unit) },
      },
    },
    specifiedLineTradeDelivery: {
      billedQuantity: { value: line.quantity, unitCode: uneceUnitCode(line.unit) },
    },
    specifiedLineTradeSettlement: {
      applicableTradeTax: [buildLineTax(line)],
      specifiedTradeSettlementLineMonetarySummation: {
        lineTotalAmount: amount(line.lineTotalCents, currency),
      },
    },
  };
}

/** Construit le modèle Cross Industry Invoice (CII D22B) depuis nos données métier. */
export function buildCrossIndustryInvoice(
  doc: FacturXInvoiceDocument,
  profile: FacturXProfile,
): CrossIndustryInvoice {
  const currency = doc.currency ?? "EUR";
  const { vatGroups, totalHtCents: lineTotalCents, totalVatCents: taxTotalCents, totalTtcCents: grandTotalCents } =
    computeInvoiceTotals(doc.lines);

  const headerTaxes: TradeTax[] = vatGroups.map((group) => ({
    calculatedAmount: amount(group.taxCents, currency),
    basisAmount: amount(group.baseCents, currency),
    typeCode: { value: "VAT" },
    categoryCode: { value: group.categoryCode },
    rateApplicablePercent: { value: group.rate },
    exemptionReason:
      group.rate === 0 && group.exemptionReason ? { value: group.exemptionReason } : undefined,
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
        // Point 5 audit pré-pilote : BT-9 échéance de paiement, jamais porté
        // jusqu'au CII auparavant (due_date était calculée et enregistrée en
        // base à la finalisation, mais jamais lue par loadFacturXDocumentFromDb
        // ni reportée dans le document transmis à la Plateforme Agréée).
        specifiedTradePaymentTerms: doc.dueDate
          ? { dueDateDateTime: { dateTimeString: formatIssueDate(doc.dueDate), format: "102" } }
          : undefined,
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
