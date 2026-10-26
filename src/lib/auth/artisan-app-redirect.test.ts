import { describe, expect, it } from "vitest";

import { artisanAppRedirect } from "./artisan-app-redirect";

const FUTURE = new Date(Date.now() + 10 * 86_400_000).toISOString();
const PAST = new Date(Date.now() - 86_400_000).toISOString();

const PROFILES = {
  nouveauCompte: { onboarding_completed_at: null, subscription_status: "incomplete" },
  onboardingFaitSansFormule: { onboarding_completed_at: PAST, subscription_status: "incomplete" },
  essai: { onboarding_completed_at: PAST, subscription_status: "trialing", trial_ends_at: FUTURE },
  actif: { onboarding_completed_at: PAST, subscription_status: "active" },
  impaye: { onboarding_completed_at: PAST, subscription_status: "past_due" },
  resilie: { onboarding_completed_at: PAST, subscription_status: "canceled" },
  suspendu: { onboarding_completed_at: PAST, subscription_status: "active", account_status: "suspended" },
  suspenduEnOnboarding: { onboarding_completed_at: null, subscription_status: "incomplete", account_status: "suspended" },
} as const;

const PATHS = ["/app", "/app/onboarding", "/app/onboarding?step=2", "/app/reglages", "/app/quotes/new", "/app/invoices", "/app/appels", "/app/suspended"];

describe("aiguillage /app : jamais de boucle", () => {
  for (const [name, profile] of Object.entries(PROFILES)) {
    it(`${name} : toute redirection mène à une page qui ne redirige plus`, () => {
      for (const path of PATHS) {
        const first = artisanAppRedirect(path.split("?")[0]!, profile);
        if (!first) continue;
        expect(artisanAppRedirect(first.pathname, profile), `${name} : ${path} → ${first.pathname}`).toBeNull();
      }
    });
  }
});

describe("ordre des étapes", () => {
  it("nouveau compte (formule pas encore choisie) : l'onboarding s'ouvre et n'est pas renvoyé vers l'abonnement", () => {
    expect(artisanAppRedirect("/app/onboarding", PROFILES.nouveauCompte)).toBeNull();
    expect(artisanAppRedirect("/app/reglages", PROFILES.nouveauCompte)).toEqual({ pathname: "/app/onboarding", search: "" });
    expect(artisanAppRedirect("/app", PROFILES.nouveauCompte)).toEqual({ pathname: "/app/onboarding", search: "" });
  });

  it("onboarding terminé sans formule : choix de formule imposé", () => {
    expect(artisanAppRedirect("/app", PROFILES.onboardingFaitSansFormule)).toMatchObject({ pathname: "/app/reglages" });
    expect(artisanAppRedirect("/app/reglages", PROFILES.onboardingFaitSansFormule)).toBeNull();
  });

  it("abonné : accès libre", () => {
    for (const p of PATHS) expect(artisanAppRedirect(p, PROFILES.actif)).toBeNull();
  });

  it("compte suspendu : page dédiée", () => {
    expect(artisanAppRedirect("/app", PROFILES.suspendu)).toEqual({ pathname: "/app/suspended", search: "" });
  });
});
