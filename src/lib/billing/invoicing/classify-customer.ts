import { validateSiren, validateSiret, validateVatNumber } from "@/lib/billing/legal-entity-validation";

/** Identifiants légaux client utilisés pour le routage B2B / B2C. */
export type CustomerLegalIds = {
  siren?: string | null;
  siret?: string | null;
  vatNumber?: string | null;
};

export type CustomerClassification = "b2b" | "b2c";

/**
 * B2B si le client possède un SIREN (ou SIRET valide) ET un numéro de TVA intracommunautaire valides.
 * Sinon B2C → flux e-reporting.
 */
export function classifyCustomer(legal: CustomerLegalIds): CustomerClassification {
  return isB2BCustomer(legal) ? "b2b" : "b2c";
}

export function isB2BCustomer(legal: CustomerLegalIds): boolean {
  const siren = resolveValidSiren(legal);
  const vat = legal.vatNumber ? validateVatNumber(legal.vatNumber) : null;
  return Boolean(siren && vat);
}

function resolveValidSiren(legal: CustomerLegalIds): string | null {
  const fromSiren = legal.siren ? validateSiren(legal.siren) : null;
  if (fromSiren) return fromSiren;

  const siret = legal.siret ? validateSiret(legal.siret) : null;
  return siret ? siret.slice(0, 9) : null;
}
