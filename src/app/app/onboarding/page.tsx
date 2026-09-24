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

  const naturalStep = resolveOnboardingStep(profile);
  let step = requestedStep ?? naturalStep;

  if (step === 2 && !isOnboardingContactStepComplete(profile)) {
    redirect("/app/onboarding?step=1");
  }

  const contactRes = await supabase
    .from("profiles")
    .select("name, business_name, phone, address_line1, address_line2, postal_code, city, latitude, longitude")
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
              name: contact?.name?.trim() ?? "",
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
              tradeRegisterNumber: profile.trade_register_number ?? "",
              decennaleInsurer: profile.decennale_insurer ?? "",
              decennalePolicyNumber: profile.decennale_policy_number ?? "",
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
