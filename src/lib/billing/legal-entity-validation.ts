/**
 * Validation SIREN / SIRET / TVA intracommunautaire (France).
 * Utilisé côté serveur avant persistance des entités légales.
 */

const SIREN_RE = /^\d{9}$/;
const SIRET_RE = /^\d{14}$/;
const NAF_RE = /^\d{2}\.\d{2}[A-Z]$/;
const COUNTRY_RE = /^[A-Z]{2}$/;
/** Format simplifié FR : FR + 2 car. + 9 chiffres SIREN */
const VAT_FR_RE = /^FR[A-HJ-NP-Z0-9]{2}\d{9}$/;

export function normalizeDigits(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/\s/g, "");
  return digits || null;
}

export function validateSiren(input: string | null | undefined): string | null {
  const digits = normalizeDigits(input);
  if (!digits) return null;
  return SIREN_RE.test(digits) ? digits : null;
}

export function validateSiret(input: string | null | undefined, siren?: string | null): string | null {
  const digits = normalizeDigits(input);
  if (!digits) return null;
  if (!SIRET_RE.test(digits)) return null;
  if (siren) {
    const normalizedSiren = validateSiren(siren);
    if (normalizedSiren && digits.slice(0, 9) !== normalizedSiren) return null;
  }
  return digits;
}

export function validateNafCode(input: string | null | undefined): string | null {
  if (!input) return null;
  const code = input.trim().toUpperCase();
  return NAF_RE.test(code) ? code : null;
}

export function validateCountryCode(input: string | null | undefined): string {
  if (!input) return "FR";
  const code = input.trim().toUpperCase();
  return COUNTRY_RE.test(code) ? code : "FR";
}

export function validateVatNumber(input: string | null | undefined): string | null {
  if (!input) return null;
  const normalized = input.replace(/\s/g, "").toUpperCase();
  if (VAT_FR_RE.test(normalized)) return normalized;
  // Autres pays UE : 2 lettres + alphanum (validation légère)
  if (/^[A-Z]{2}[A-Z0-9]{2,12}$/.test(normalized)) return normalized;
  return null;
}

export function validateTradeRegisterNumber(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  return trimmed.length >= 3 ? trimmed : null;
}

export type LegalEntityValidationResult =
  | { ok: true; fields: LegalEntityValidatedFields }
  | { ok: false; error: LegalEntityValidationError };

export type LegalEntityValidationError =
  | "invalid_siren"
  | "invalid_siret"
  | "invalid_naf"
  | "invalid_vat"
  | "invalid_trade_register";

export type LegalEntityValidatedFields = {
  siren: string | null;
  siret: string | null;
  vat_number: string | null;
  naf_code: string | null;
  country_code: string;
  trade_register_number: string | null;
};

export type LegalEntityInput = {
  siren?: string | null;
  siret?: string | null;
  vat_number?: string | null;
  naf_code?: string | null;
  country_code?: string | null;
  trade_register_number?: string | null;
};

/** Valide les champs légaux B2B ; champs vides autorisés (artisan en cours de paramétrage). */
export function validateLegalEntityFields(input: LegalEntityInput): LegalEntityValidationResult {
  const sirenRaw = input.siren?.trim() ?? "";
  const siretRaw = input.siret?.trim() ?? "";
  const vatRaw = input.vat_number?.trim() ?? "";
  const nafRaw = input.naf_code?.trim() ?? "";
  const tradeRaw = input.trade_register_number?.trim() ?? "";

  const siren = sirenRaw ? validateSiren(sirenRaw) : null;
  if (sirenRaw && !siren) return { ok: false, error: "invalid_siren" };

  const siret = siretRaw ? validateSiret(siretRaw, siren ?? sirenRaw) : null;
  if (siretRaw && !siret) return { ok: false, error: "invalid_siret" };

  const vat_number = vatRaw ? validateVatNumber(vatRaw) : null;
  if (vatRaw && !vat_number) return { ok: false, error: "invalid_vat" };

  const naf_code = nafRaw ? validateNafCode(nafRaw) : null;
  if (nafRaw && !naf_code) return { ok: false, error: "invalid_naf" };

  const trade_register_number = tradeRaw ? validateTradeRegisterNumber(tradeRaw) : null;
  if (tradeRaw && !trade_register_number) return { ok: false, error: "invalid_trade_register" };

  return {
    ok: true,
    fields: {
      siren,
      siret,
      vat_number,
      naf_code,
      country_code: validateCountryCode(input.country_code),
      trade_register_number,
    },
  };
}
