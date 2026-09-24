"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { validateLegalEntityFields } from "@/lib/billing/legal-entity-validation";
import { requireArtisanProfileId } from "@/lib/auth/require-artisan";
import { geocodeAddress } from "@/lib/geo/ban";
import {
  normalizePhone,
  normalizePostalCode,
  parseContactFieldsFromForm,
} from "@/lib/settings/contact-fields";

export type OnboardingContactError =
  | "missing_name"
  | "missing_business_name"
  | "invalid_phone"
  | "missing_address"
  | "invalid_postal_code"
  | "missing_city"
  | "save_failed";

export async function saveOnboardingContactStep(formData: FormData) {
  const displayName = String(formData.get("display_name") ?? "").trim();
  const businessName = String(formData.get("business_name") ?? "").trim();
  if (!displayName) return { ok: false as const, error: "missing_name" as const };
  if (!businessName) return { ok: false as const, error: "missing_business_name" as const };

  const contact = parseContactFieldsFromForm(formData);
  if (!contact.phone) return { ok: false as const, error: "invalid_phone" as const };
  const phone = normalizePhone(contact.phone);
  if (!phone) return { ok: false as const, error: "invalid_phone" as const };

  if (!contact.address_line1) return { ok: false as const, error: "missing_address" as const };
  if (!contact.city) return { ok: false as const, error: "missing_city" as const };

  const postal_code = contact.postal_code ? normalizePostalCode(contact.postal_code) : null;
  if (!postal_code) return { ok: false as const, error: "invalid_postal_code" as const };

  const auth = await requireArtisanProfileId();
  if (!auth.ok) {
    if (auth.error === "auth") redirect("/login?next=/app/onboarding");
    return { ok: false as const, error: "save_failed" as const };
  }
  const { supabase, profileId } = auth;

  const latRaw = String(formData.get("latitude") ?? "").trim();
  const lngRaw = String(formData.get("longitude") ?? "").trim();
  let latitude: number | null = latRaw ? Number(latRaw) : null;
  let longitude: number | null = lngRaw ? Number(lngRaw) : null;
  if (!Number.isFinite(latitude ?? NaN)) latitude = null;
  if (!Number.isFinite(longitude ?? NaN)) longitude = null;

  if ((latitude === null || longitude === null) && contact.address_line1) {
    const geo = await geocodeAddress({
      addressLine1: contact.address_line1,
      postalCode: postal_code,
      city: contact.city,
    });
    if (geo) {
      latitude = geo.latitude;
      longitude = geo.longitude;
    }
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      name: displayName,
      business_name: businessName,
      phone,
      address_line1: contact.address_line1,
      address_line2: contact.address_line2,
      postal_code,
      city: contact.city,
      latitude,
      longitude,
    })
    .eq("id", profileId);

  if (error) return { ok: false as const, error: "save_failed" as const };

  revalidatePath("/app/onboarding");
  revalidatePath("/app/reglages");
  redirect("/app/onboarding?step=2");
}

export type OnboardingLegalError =
  | "invalid_siren"
  | "invalid_siret"
  | "invalid_vat"
  | "invalid_trade_register"
  | "missing_decennale"
  | "missing_rc_pro"
  | "missing_mediator"
  | "invalid_mediator_url"
  | "invalid_payment_terms"
  | "save_failed";

export async function saveOnboardingLegalStep(formData: FormData) {
  const siren = String(formData.get("siren") ?? "").trim();
  const siret = String(formData.get("siret") ?? "").trim();
  const vatNumber = String(formData.get("vat_number") ?? "").trim();
  const tradeRegisterNumber = String(formData.get("trade_register_number") ?? "").trim();
  const decennaleInsurer = String(formData.get("decennale_insurer") ?? "").trim();
  const decennalePolicyNumber = String(formData.get("decennale_policy_number") ?? "").trim();
  const rcProInsurer = String(formData.get("rc_pro_insurer") ?? "").trim();
  const rcProNumber = String(formData.get("rc_pro_number") ?? "").trim();
  const mediatorName = String(formData.get("mediator_name") ?? "").trim();
  const mediatorUrl = String(formData.get("mediator_url") ?? "").trim();
  const paymentTermsRaw = Number(formData.get("default_payment_terms_days"));

  if (!decennaleInsurer || !decennalePolicyNumber) {
    return { ok: false as const, error: "missing_decennale" as const };
  }
  if (!rcProInsurer || !rcProNumber) {
    return { ok: false as const, error: "missing_rc_pro" as const };
  }
  if (!mediatorName) return { ok: false as const, error: "missing_mediator" as const };
  if (!mediatorUrl || !/^https?:\/\/.+/i.test(mediatorUrl)) {
    return { ok: false as const, error: "invalid_mediator_url" as const };
  }

  const legal = validateLegalEntityFields({
    siren,
    siret,
    vat_number: vatNumber,
    trade_register_number: tradeRegisterNumber,
  });
  if (!legal.ok) return { ok: false as const, error: legal.error };
  if (!legal.fields.siren || !legal.fields.siret || !legal.fields.vat_number || !legal.fields.trade_register_number) {
    if (!siren) return { ok: false as const, error: "invalid_siren" as const };
    if (!siret) return { ok: false as const, error: "invalid_siret" as const };
    if (!vatNumber) return { ok: false as const, error: "invalid_vat" as const };
    return { ok: false as const, error: "invalid_trade_register" as const };
  }

  const paymentTerms = Number.isFinite(paymentTermsRaw) ? Math.round(paymentTermsRaw) : NaN;
  if (!Number.isFinite(paymentTerms) || paymentTerms <= 0 || paymentTerms > 365) {
    return { ok: false as const, error: "invalid_payment_terms" as const };
  }

  const auth = await requireArtisanProfileId();
  if (!auth.ok) {
    if (auth.error === "auth") redirect("/login?next=/app/onboarding?step=2");
    return { ok: false as const, error: "save_failed" as const };
  }
  const { supabase, profileId } = auth;

  const { error } = await supabase
    .from("profiles")
    .update({
      siren: legal.fields.siren,
      siret: legal.fields.siret,
      vat_number: legal.fields.vat_number,
      trade_register_number: legal.fields.trade_register_number,
      decennale_insurer: decennaleInsurer,
      decennale_policy_number: decennalePolicyNumber,
      rc_pro_insurer: rcProInsurer,
      rc_pro_number: rcProNumber,
      mediator_name: mediatorName,
      mediator_url: mediatorUrl,
      default_payment_terms_days: paymentTerms,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq("id", profileId);

  if (error) return { ok: false as const, error: "save_failed" as const };

  revalidatePath("/app/onboarding");
  revalidatePath("/app/reglages");
  revalidatePath("/app");
  redirect("/app");
}
