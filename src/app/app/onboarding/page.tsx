import { redirect } from "next/navigation";

import { AppPageHeader } from "@/components/app/app-page-header";
import { SupabaseMissing } from "@/components/supabase-missing";
import {
  ARTISAN_ONBOARDING_PROFILE_SELECT,
  artisanNeedsOnboarding,
  isOnboardingContactStepComplete,
  resolveOnboardingStep,
} from "@/lib/auth/artisan-onboarding";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { OnboardingContactStep } from "./onboarding-contact-step";
import { OnboardingImport } from "./onboarding-import";
import { OnboardingLegalStep } from "./onboarding-legal-step";

function parseRequestedStep(raw: string | undefined): 1 | 2 | null {
  if (raw === "1") return 1;
  if (raw === "2") return 2;
  return null;
}

export default async function ArtisanOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <SupabaseMissing title="Paramétrage indisponible" />;
  }

  const sp = await searchParams;
  const requestedStep = parseRequestedStep(typeof sp.step === "string" ? sp.step : undefined);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/app/onboarding");

  const { data: profile } = await supabase
    .from("profiles")
    .select(ARTISAN_ONBOARDING_PROFILE_SELECT)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile) redirect("/compte");

  if (!artisanNeedsOnboarding(profile)) {
    redirect("/app");
  }

  // Parcours par défaut : import d'anciens devis (zéro saisie). Saisie manuelle via ?step=1|2.
  if (requestedStep === null) {
    const { data: known } = await supabase
      .from("profiles")
      .select(
        "first_name, last_name, business_name, phone, address_line1, postal_code, city, siret, vat_number, vat_regime, trade_register_number, decennale_insurer, decennale_policy_number, decennale_coverage_area, rc_pro_insurer, rc_pro_number, mediator_name, mediator_url, default_payment_terms_days",
      )
      .eq("user_id", user.id)
      .maybeSingle();
    const k = (known ?? {}) as Record<string, string | number | null>;
    const str = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : String(v));
    const existing = {
      first_name: str(k.first_name),
      last_name: str(k.last_name),
      business_name: str(k.business_name),
      phone: str(k.phone),
      address_line1: str(k.address_line1),
      postal_code: str(k.postal_code),
      city: str(k.city),
      siret: str(k.siret),
      vat_number: str(k.vat_number),
      trade_register: str(k.trade_register_number),
      decennale_insurer: str(k.decennale_insurer),
      decennale_policy_number: str(k.decennale_policy_number),
      decennale_coverage_area: str(k.decennale_coverage_area),
      rc_pro_insurer: str(k.rc_pro_insurer),
      rc_pro_number: str(k.rc_pro_number),
      mediator_name: str(k.mediator_name),
      mediator_url: str(k.mediator_url),
      payment_terms_days: "",
      vat_regime: str(k.vat_regime) === "franchise" ? "franchise" : "",
    };
    return (
      <div className="mx-auto max-w-2xl space-y-6 pb-12">
        <AppPageHeader
          eyebrow="Bienvenue sur Soline"
          title="On prépare ton compte à partir de tes devis"
          description="2 minutes : une photo ou un PDF de tes anciens devis, puis tu complètes uniquement ce qui manque."
        />
        <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-8">
          <OnboardingImport existing={existing} />
        </div>
      </div>
    );
  }

  const naturalStep = resolveOnboardingStep(profile);
  const step = requestedStep ?? naturalStep;

  if (step === 2 && !isOnboardingContactStepComplete(profile)) {
    redirect("/app/onboarding?step=1");
  }

  const contactRes = await supabase
    .from("profiles")
    .select("name, first_name, last_name, business_name, phone, address_line1, address_line2, postal_code, city, latitude, longitude")
    .eq("user_id", user.id)
    .maybeSingle();

  const contact = contactRes.data;

  return (
    <div className="mx-auto max-w-2xl space-y-8 pb-12">
      <AppPageHeader
        eyebrow="Bienvenue sur Soline"
        title="Paramètre ton compte"
        description={
          step === 1
            ? "Étape 1 sur 2 — coordonnées professionnelles. Tous les champs marqués sont obligatoires."
            : "Étape 2 sur 2 — mentions légales et assurances. Tous les champs sont obligatoires."
        }
      />

      <div className="flex gap-2">
        <div
          className={`h-1.5 flex-1 rounded-full ${step === 1 ? "bg-primary" : "bg-primary/30"}`}
          aria-hidden
        />
        <div
          className={`h-1.5 flex-1 rounded-full ${step === 2 ? "bg-primary" : "bg-muted"}`}
          aria-hidden
        />
      </div>

      <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        {step === 1 ? (
          <OnboardingContactStep
            email={user.email ?? ""}
            initialValues={{
              firstName: contact?.first_name?.trim() ?? "",
              lastName: contact?.last_name?.trim() ?? "",
              businessName: contact?.business_name?.trim() ?? "",
              phone: contact?.phone ?? "",
              addressLine1: contact?.address_line1 ?? "",
              addressLine2: contact?.address_line2 ?? "",
              postalCode: contact?.postal_code ?? "",
              city: contact?.city ?? "",
              latitude: contact?.latitude ?? null,
              longitude: contact?.longitude ?? null,
            }}
          />
        ) : (
          <OnboardingLegalStep
            initialValues={{
              siren: profile.siren ?? "",
              siret: profile.siret ?? "",
              vatNumber: profile.vat_number ?? "",
              vatRegime: profile.vat_regime === "franchise" ? "franchise" : profile.vat_number ? "normal" : null,
              tradeRegisterNumber: profile.trade_register_number ?? "",
              decennaleInsurer: profile.decennale_insurer ?? "",
              decennalePolicyNumber: profile.decennale_policy_number ?? "",
              decennaleCoverageArea: (profile as { decennale_coverage_area?: string | null }).decennale_coverage_area ?? "",
              rcProInsurer: profile.rc_pro_insurer ?? "",
              rcProNumber: profile.rc_pro_number ?? "",
              mediatorName: profile.mediator_name ?? "",
              mediatorUrl: profile.mediator_url ?? "",
              defaultPaymentTermsDays: profile.default_payment_terms_days ?? 30,
            }}
          />
        )}
      </div>
    </div>
  );
}
