import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { resolveCheckoutTrialEnd } from "./trial-eligibility";

/** Faux client : renvoie le nombre d'autres profils ayant déjà utilisé ce SIREN. */
function adminWithOtherProfiles(count: number) {
  const query = {
    select: () => query,
    eq: () => query,
    neq: () => query,
    then: (resolve: (value: { count: number }) => unknown) => resolve({ count }),
  };
  return { from: () => query } as unknown as SupabaseClient;
}

describe("resolveCheckoutTrialEnd", () => {
  const profile = { subscription_status: "incomplete", trial_ends_at: null, siren: "123456789" };

  it("accorde l'essai à une entreprise qui ne l'a jamais utilisé", async () => {
    expect(await resolveCheckoutTrialEnd(adminWithOtherProfiles(0), profile, "p1")).not.toBeNull();
  });

  it("refuse l'essai si un autre compte du même SIREN a déjà été abonné", async () => {
    expect(await resolveCheckoutTrialEnd(adminWithOtherProfiles(1), profile, "p1")).toBeNull();
  });

  it("refuse l'essai après une résiliation", async () => {
    expect(
      await resolveCheckoutTrialEnd(adminWithOtherProfiles(0), { ...profile, subscription_status: "canceled" }, "p1"),
    ).toBeNull();
  });
});
