import { describe, expect, it } from "vitest";

import { resolveCustomerClassification } from "./resolve-customer-classification";

/** Stub minimal : seul `.from("customer_profiles").select().eq().maybeSingle()` est utilisé. */
function stubSupabase(customerProfileRow: Record<string, unknown> | null) {
  return {
    from: (table: string) => {
      if (table !== "customer_profiles") throw new Error(`unexpected table: ${table}`);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: customerProfileRow, error: null }),
          }),
        }),
      };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("resolveCustomerClassification", () => {
  it("b2c sans customer_user_id (pas de requête nécessaire)", async () => {
    const supabase = stubSupabase(null);
    await expect(resolveCustomerClassification(supabase, null)).resolves.toBe("b2c");
    await expect(resolveCustomerClassification(supabase, undefined)).resolves.toBe("b2c");
  });

  it("b2c si customer_user_id présent mais aucun profil trouvé", async () => {
    const supabase = stubSupabase(null);
    await expect(resolveCustomerClassification(supabase, "user-1")).resolves.toBe("b2c");
  });

  it("b2c si le profil client n'a pas de SIREN+TVA valides", async () => {
    const supabase = stubSupabase({ siren: null, siret: null, vat_number: null });
    await expect(resolveCustomerClassification(supabase, "user-1")).resolves.toBe("b2c");
  });

  it("b2b si le profil client a un SIREN et une TVA valides", async () => {
    const supabase = stubSupabase({ siren: "123456789", siret: null, vat_number: "FR12123456789" });
    await expect(resolveCustomerClassification(supabase, "user-1")).resolves.toBe("b2b");
  });

  it("b2b via SIRET + TVA si le SIREN seul est absent", async () => {
    const supabase = stubSupabase({ siren: null, siret: "12345678901234", vat_number: "FR12123456789" });
    await expect(resolveCustomerClassification(supabase, "user-1")).resolves.toBe("b2b");
  });
});
