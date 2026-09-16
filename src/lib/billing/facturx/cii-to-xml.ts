import type {
  CiiAmount,
  CiiCode,
  CiiDateTime,
  CiiId,
  CiiQuantity,
  CiiText,
  CrossIndustryInvoice,
  SupplyChainTradeLineItem,
  TradeParty,
  TradeTax,
} from "./cii-types";

const XML_HEADER = `<?xml version="1.0" encoding="UTF-8"?>`;
const ROOT_OPEN = `<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`;
const ROOT_CLOSE = `</rsm:CrossIndustryInvoice>`;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function attrs(input: Record<string, string | undefined>): string {
  return Object.entries(input)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => ` ${key}="${escapeXml(value!)}"`)
    .join("");
}

function el(name: string, content: string, attributes: Record<string, string | undefined> = {}): string {
  const trimmed = content.trim();
  if (!trimmed) return "";
  return `<${name}${attrs(attributes)}>${escapeXml(trimmed)}</${name}>`;
}

function amountTag(name: string, amount: CiiAmount): string {
  return el(name, amount.value.toFixed(2), { currencyID: amount.currencyID });
}

function idTag(name: string, id: CiiId): string {
  return el(name, id.value, { schemeID: id.schemeID });
}

function textTag(name: string, text: CiiText): string {
  return el(name, text.value);
}

function codeTag(name: string, code: CiiCode): string {
  return el(name, code.value, { listID: code.listID, listVersionID: code.listVersionID });
}

function dateTimeTag(name: string, dateTime: CiiDateTime): string {
  return `<${name}><udt:DateTimeString format="${escapeXml(dateTime.format)}">${escapeXml(dateTime.dateTimeString)}</udt:DateTimeString></${name}>`;
}

function quantityTag(name: string, quantity: CiiQuantity): string {
  return el(name, String(quantity.value), { unitCode: quantity.unitCode });
}

function renderTradeTax(tax: TradeTax): string {
  const parts = [
    amountTag("ram:CalculatedAmount", tax.calculatedAmount),
    codeTag("ram:TypeCode", tax.typeCode),
  ];
  if (tax.exemptionReason) {
    parts.push(textTag("ram:ExemptionReason", tax.exemptionReason));
  }
  parts.push(
    amountTag("ram:BasisAmount", tax.basisAmount),
    codeTag("ram:CategoryCode", tax.categoryCode),
    `<ram:RateApplicablePercent>${tax.rateApplicablePercent.value}</ram:RateApplicablePercent>`,
  );
  return `<ram:ApplicableTradeTax>${parts.join("")}</ram:ApplicableTradeTax>`;
}

function renderTradeParty(party: TradeParty): string {
  const parts = [textTag("ram:Name", party.name)];

  if (party.specifiedLegalOrganization) {
    const org = party.specifiedLegalOrganization;
    parts.push(
      `<ram:SpecifiedLegalOrganization>${idTag("ram:ID", org.id)}${
        org.tradingBusinessName ? textTag("ram:TradingBusinessName", org.tradingBusinessName) : ""
      }</ram:SpecifiedLegalOrganization>`,
    );
  }

  if (party.definedTradeContact?.length) {
    for (const contact of party.definedTradeContact) {
      parts.push(
        `<ram:DefinedTradeContact>${
          contact.telephoneUniversalCommunication
            ? `<ram:TelephoneUniversalCommunication>${textTag("ram:CompleteNumber", contact.telephoneUniversalCommunication.completeNumber)}</ram:TelephoneUniversalCommunication>`
            : ""
        }${
          contact.emailURIUniversalCommunication
            ? `<ram:EmailURIUniversalCommunication>${idTag("ram:URIID", contact.emailURIUniversalCommunication.uriID)}</ram:EmailURIUniversalCommunication>`
            : ""
        }</ram:DefinedTradeContact>`,
      );
    }
  }

  const address = party.postalTradeAddress;
  parts.push(
    `<ram:PostalTradeAddress>${
      address.postcodeCode ? codeTag("ram:PostcodeCode", address.postcodeCode) : ""
    }${address.lineOne ? textTag("ram:LineOne", address.lineOne) : ""}${
      address.lineTwo ? textTag("ram:LineTwo", address.lineTwo) : ""
    }${address.cityName ? textTag("ram:CityName", address.cityName) : ""}${codeTag("ram:CountryID", address.countryID)}</ram:PostalTradeAddress>`,
  );

  if (party.specifiedTaxRegistration?.length) {
    for (const registration of party.specifiedTaxRegistration) {
      parts.push(
        `<ram:SpecifiedTaxRegistration>${idTag("ram:ID", registration.id)}</ram:SpecifiedTaxRegistration>`,
      );
    }
  }

  return parts.join("");
}

function renderLineItem(line: SupplyChainTradeLineItem): string {
  return `<ram:IncludedSupplyChainTradeLineItem><ram:AssociatedDocumentLineDocument>${idTag("ram:LineID", line.associatedDocumentLineDocument.lineID)}</ram:AssociatedDocumentLineDocument><ram:SpecifiedTradeProduct>${textTag("ram:Name", line.specifiedTradeProduct.name)}</ram:SpecifiedTradeProduct><ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice>${amountTag("ram:ChargeAmount", line.specifiedLineTradeAgreement.netPriceProductTradePrice.chargeAmount)}${quantityTag("ram:BasisQuantity", line.specifiedLineTradeAgreement.netPriceProductTradePrice.basisQuantity)}</ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement><ram:SpecifiedLineTradeDelivery>${quantityTag("ram:BilledQuantity", line.specifiedLineTradeDelivery.billedQuantity)}</ram:SpecifiedLineTradeDelivery><ram:SpecifiedLineTradeSettlement>${line.specifiedLineTradeSettlement.applicableTradeTax.map(renderTradeTax).join("")}<ram:SpecifiedTradeSettlementLineMonetarySummation>${amountTag("ram:LineTotalAmount", line.specifiedLineTradeSettlement.specifiedTradeSettlementLineMonetarySummation.lineTotalAmount)}</ram:SpecifiedTradeSettlementLineMonetarySummation></ram:SpecifiedLineTradeSettlement></ram:IncludedSupplyChainTradeLineItem>`;
}

/** Sérialise un modèle CII en XML Factur-X sans libxmljs (compatible Vercel / Node 24). */
export function crossIndustryInvoiceToXml(invoice: CrossIndustryInvoice): string {
  const notes =
    invoice.exchangedDocument.includedNote
      ?.map((note) =>
        note.content ? `<ram:IncludedNote>${textTag("ram:Content", note.content)}</ram:IncludedNote>` : "",
      )
      .join("") ?? "";

  const settlement = invoice.supplyChainTradeTransaction.applicableHeaderTradeSettlement;
  const summation = settlement.specifiedTradeSettlementHeaderMonetarySummation;
  // Point 5 audit pré-pilote : BT-9 échéance de paiement (EN16931 BR-CO-25).
  // Doit apparaître entre ApplicableTradeTax et
  // SpecifiedTradeSettlementHeaderMonetarySummation (ordre du schéma CII D22B).
  const paymentTerms = settlement.specifiedTradePaymentTerms
    ? `<ram:SpecifiedTradePaymentTerms>${dateTimeTag("ram:DueDateDateTime", settlement.specifiedTradePaymentTerms.dueDateDateTime)}</ram:SpecifiedTradePaymentTerms>`
    : "";

  const body = [
    `<rsm:ExchangedDocumentContext><ram:GuidelineSpecifiedDocumentContextParameter>${idTag("ram:ID", invoice.exchangedDocumentContext.guidelineSpecifiedDocumentContextParameter.id)}</ram:GuidelineSpecifiedDocumentContextParameter></rsm:ExchangedDocumentContext>`,
    `<rsm:ExchangedDocument>${idTag("ram:ID", invoice.exchangedDocument.id)}${codeTag("ram:TypeCode", invoice.exchangedDocument.typeCode)}${dateTimeTag("ram:IssueDateTime", invoice.exchangedDocument.issueDateTime)}${notes}</rsm:ExchangedDocument>`,
    `<rsm:SupplyChainTradeTransaction>${invoice.supplyChainTradeTransaction.includedSupplyChainTradeLineItem.map(renderLineItem).join("")}<ram:ApplicableHeaderTradeAgreement><ram:SellerTradeParty>${renderTradeParty(invoice.supplyChainTradeTransaction.applicableHeaderTradeAgreement.sellerTradeParty)}</ram:SellerTradeParty><ram:BuyerTradeParty>${renderTradeParty(invoice.supplyChainTradeTransaction.applicableHeaderTradeAgreement.buyerTradeParty)}</ram:BuyerTradeParty></ram:ApplicableHeaderTradeAgreement><ram:ApplicableHeaderTradeDelivery></ram:ApplicableHeaderTradeDelivery><ram:ApplicableHeaderTradeSettlement>${codeTag("ram:InvoiceCurrencyCode", settlement.invoiceCurrencyCode)}${settlement.applicableTradeTax.map(renderTradeTax).join("")}${paymentTerms}<ram:SpecifiedTradeSettlementHeaderMonetarySummation>${amountTag("ram:LineTotalAmount", summation.lineTotalAmount)}${amountTag("ram:TaxBasisTotalAmount", summation.taxBasisTotalAmount)}${summation.taxTotalAmount.map((tax) => amountTag("ram:TaxTotalAmount", tax)).join("")}${amountTag("ram:GrandTotalAmount", summation.grandTotalAmount)}${amountTag("ram:DuePayableAmount", summation.duePayableAmount)}</ram:SpecifiedTradeSettlementHeaderMonetarySummation></ram:ApplicableHeaderTradeSettlement></rsm:SupplyChainTradeTransaction>`,
  ].join("");

  return `${XML_HEADER}${ROOT_OPEN}${body}${ROOT_CLOSE}`;
}
