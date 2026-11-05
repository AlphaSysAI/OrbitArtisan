import { describe, expect, it } from "vitest";

import { planFromLookupKey, planFromPriceIdEnv, subscriptionLookupKey } from "./price-plan-map";

const env = {
  STRIPE_PRICE_BASE_MONTHLY: "price_base_m",
  STRIPE_PRICE_PRO_MONTHLY: "price_pro_m",
  STRIPE_PRICE_PRO_ANNUAL: " price_pro_y ",
  STRIPE_PRICE_PREMIUM_MONTHLY: "price_prem_m",
};

describe("planFromPriceIdEnv", () => {
  it("retrouve formule et périodicité à partir du prix payé", () => {
    expect(planFromPriceIdEnv("price_pro_m", env)).toEqual({ planId: "pro", interval: "monthly" });
    expect(planFromPriceIdEnv("price_pro_y", env)).toEqual({ planId: "pro", interval: "annual" });
    expect(planFromPriceIdEnv("price_prem_m", env)).toEqual({ planId: "premium", interval: "monthly" });
  });

  it("renvoie null pour un prix inconnu (ancienne grille) ou vide", () => {
    expect(planFromPriceIdEnv("price_old_6990", env)).toBeNull();
    expect(planFromPriceIdEnv(null, env)).toBeNull();
  });
});

describe("planFromLookupKey", () => {
  it("retrouve formule et périodicité à partir de la clé du prix", () => {
    expect(subscriptionLookupKey("premium", "annual")).toBe("solinebtp_premium_annual");
    expect(planFromLookupKey("solinebtp_pro_monthly")).toEqual({ planId: "pro", interval: "monthly" });
    expect(planFromLookupKey("solinebtp_base_annual")).toEqual({ planId: "base", interval: "annual" });
  });

  it("renvoie null pour une clé inconnue ou absente", () => {
    expect(planFromLookupKey("autre_produit")).toBeNull();
    expect(planFromLookupKey(null)).toBeNull();
  });
});
