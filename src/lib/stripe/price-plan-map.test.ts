import { describe, expect, it } from "vitest";

import { planFromPriceIdEnv } from "./price-plan-map";

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
