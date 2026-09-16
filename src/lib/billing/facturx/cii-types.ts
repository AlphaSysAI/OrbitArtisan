/** Modèle CII D22B (sous-ensemble utilisé par Soline) — sans dépendance libxmljs. */

export type CiiAmount = { value: number; currencyID?: string };
export type CiiId = { value: string; schemeID?: string };
export type CiiText = { value: string };
export type CiiCode = { value: string; listID?: string; listVersionID?: string };
export type CiiDateTime = { dateTimeString: string; format: string };
export type CiiQuantity = { value: number; unitCode?: string };
export type CiiPercent = { value: number };

export type CrossIndustryInvoice = {
  exchangedDocumentContext: {
    guidelineSpecifiedDocumentContextParameter: { id: CiiId };
  };
  exchangedDocument: {
    id: CiiId;
    typeCode: CiiCode;
    issueDateTime: CiiDateTime;
    includedNote?: Array<{ content?: CiiText }>;
  };
  supplyChainTradeTransaction: {
    includedSupplyChainTradeLineItem: SupplyChainTradeLineItem[];
    applicableHeaderTradeAgreement: {
      sellerTradeParty: TradeParty;
      buyerTradeParty: TradeParty;
    };
    applicableHeaderTradeDelivery: Record<string, never>;
    applicableHeaderTradeSettlement: {
      invoiceCurrencyCode: CiiCode;
      applicableTradeTax: TradeTax[];
      /** Point 5 audit pré-pilote : BT-9 (échéance de paiement) — absent jusqu'ici, alors qu'EN16931 (BR-CO-25) exige BT-9 ou BT-20 dès qu'un montant est dû. */
      specifiedTradePaymentTerms?: { dueDateDateTime: CiiDateTime };
      specifiedTradeSettlementHeaderMonetarySummation: {
        lineTotalAmount: CiiAmount;
        taxBasisTotalAmount: CiiAmount;
        taxTotalAmount: CiiAmount[];
        grandTotalAmount: CiiAmount;
        duePayableAmount: CiiAmount;
      };
    };
  };
};

export type TradeParty = {
  name: CiiText;
  specifiedLegalOrganization?: {
    id: CiiId;
    tradingBusinessName?: CiiText;
  };
  definedTradeContact?: Array<{
    emailURIUniversalCommunication?: { uriID: CiiId };
    telephoneUniversalCommunication?: { completeNumber: CiiText };
  }>;
  postalTradeAddress: {
    postcodeCode?: CiiCode;
    lineOne?: CiiText;
    lineTwo?: CiiText;
    cityName?: CiiText;
    countryID: CiiCode;
  };
  specifiedTaxRegistration?: Array<{ id: CiiId }>;
};

export type TradeTax = {
  calculatedAmount: CiiAmount;
  basisAmount: CiiAmount;
  typeCode: CiiCode;
  categoryCode: CiiCode;
  rateApplicablePercent: CiiPercent;
  exemptionReason?: CiiText;
};

export type SupplyChainTradeLineItem = {
  associatedDocumentLineDocument: { lineID: CiiId };
  specifiedTradeProduct: { name: CiiText };
  specifiedLineTradeAgreement: {
    netPriceProductTradePrice: {
      chargeAmount: CiiAmount;
      basisQuantity: CiiQuantity;
    };
  };
  specifiedLineTradeDelivery: { billedQuantity: CiiQuantity };
  specifiedLineTradeSettlement: {
    applicableTradeTax: TradeTax[];
    specifiedTradeSettlementLineMonetarySummation: { lineTotalAmount: CiiAmount };
  };
};
