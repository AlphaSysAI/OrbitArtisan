import { validateSiren, validateSiret } from "@/lib/billing/legal-entity-validation";

/** Identifiants légaux client utilisés pour le routage B2B / B2C. */
type CustomerLegalIds = {
  siren?: string | null;
  siret?: string | null;
  vatNumber?: string | null;
};

export type CustomerClassification = "b2b" | "b2c";

/**
 * Un SIREN ou SIRET identifie une entreprise, y compris en franchise de TVA.
 * Sinon B2C → flux e-reporting.
 */
export function classifyCustomer(legal: CustomerLegalIds): CustomerClassification {
  return isB2BCustomer(legal) ? "b2b" : "b2c";
}

export function isB2BCustomer(legal: CustomerLegalIds): boolean {
  return Boolean(resolveValidSiren(legal));
}

function resolveValidSiren(legal: CustomerLegalIds): string | null {
  const fromSiren = legal.siren ? validateSiren(legal.siren) : null;
  if (fromSiren) return fromSiren;

  const siret = legal.siret ? validateSiret(legal.siret) : null;
  return siret ? siret.slice(0, 9) : null;
}
