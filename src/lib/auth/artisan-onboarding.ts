import { validateLegalEntityFields } from "@/lib/billing/legal-entity-validation";
import { normalizePhone, normalizePostalCode } from "@/lib/settings/contact-fields";

export type ArtisanOnboardingProfile = {
  onboarding_completed_at?: string | null;
  name?: string | null;
  business_name?: string | null;
  phone?: string | null;
  address_line1?: string | null;
  postal_code?: string | null;
  city?: string | null;
  siren?: string | null;
  siret?: string | null;
  vat_number?: string | null;
  trade_register_number?: string | null;
  decennale_insurer?: string | null;
  decennale_policy_number?: string | null;
  rc_pro_insurer?: string | null;
  rc_pro_number?: string | null;
  mediator_name?: string | null;
  mediator_url?: string | null;
  default_payment_terms_days?: number | null;
};

export function isOnboardingContactStepComplete(profile: ArtisanOnboardingProfile): boolean {
  const name = profile.name?.trim();
  const businessName = profile.business_name?.trim();
  const phone = profile.phone ? normalizePhone(profile.phone) : null;
  const postal = profile.postal_code ? normalizePostalCode(profile.postal_code) : null;
  const address = profile.address_line1?.trim();
  const city = profile.city?.trim();

  return !!(name && businessName && phone && address && postal && city);
}

export function isOnboardingLegalStepComplete(profile: ArtisanOnboardingProfile): boolean {
  const legal = validateLegalEntityFields({
    siren: profile.siren,
    siret: profile.siret,
    vat_number: profile.vat_number,
    trade_register_number: profile.trade_register_number,
  });
  if (!legal.ok) return false;

  const requiredStrings = [
    profile.decennale_insurer,
    profile.decennale_policy_number,
    profile.rc_pro_insurer,
    profile.rc_pro_number,
    profile.mediator_name,
    profile.mediator_url,
  ];
  if (requiredStrings.some((v) => !v?.trim())) return false;

  const mediatorUrl = profile.mediator_url!.trim();
  if (!/^https?:\/\/.+/i.test(mediatorUrl)) return false;

  const paymentDays = profile.default_payment_terms_days;
  if (paymentDays == null || !Number.isFinite(paymentDays) || paymentDays <= 0 || paymentDays > 365) {
    return false;
  }

  return !!(legal.fields.siren && legal.fields.siret && legal.fields.vat_number && legal.fields.trade_register_number);
}

export function artisanNeedsOnboarding(profile: ArtisanOnboardingProfile | null | undefined): boolean {
  if (!profile) return false;
  if (profile.onboarding_completed_at) return false;
  return true;
}

export type OnboardingStep = 1 | 2;

export function resolveOnboardingStep(profile: ArtisanOnboardingProfile): OnboardingStep {
  if (!isOnboardingContactStepComplete(profile)) return 1;
  return 2;
}

export const ARTISAN_ONBOARDING_PROFILE_SELECT =
  "onboarding_completed_at, name, business_name, phone, address_line1, postal_code, city, siren, siret, vat_number, trade_register_number, decennale_insurer, decennale_policy_number, rc_pro_insurer, rc_pro_number, mediator_name, mediator_url, default_payment_terms_days";
