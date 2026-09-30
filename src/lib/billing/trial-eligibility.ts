import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Essai gratuit : une seule fois par entreprise (SIREN). Un autre compte du même
 * SIREN ayant déjà démarré un abonnement Stripe (essai compris) → pas d'essai.
 */
export async function sirenAlreadyUsedTrial(admin: SupabaseClient, siren: string | null | undefined, profileId: string): Promise<boolean> {
  const digits = String(siren ?? "").replace(/\D/g, "");
  if (digits.length !== 9) return false;
  const { count } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("siren", digits)
    .neq("id", profileId)
    .neq("subscription_status", "incomplete");
  return (count ?? 0) > 0;
}
