import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { stripeTrialEndFromProfile } from "@/lib/stripe/subscription-trial";

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

/**
 * Fin d'essai (unix) à appliquer au prochain checkout, ou null si l'artisan
 * paiera immédiatement. Source unique pour le paiement et pour l'affichage.
 */
export async function resolveCheckoutTrialEnd(
  admin: SupabaseClient | null,
  profile: { subscription_status?: string | null; trial_ends_at?: string | null; siren?: string | null },
  profileId: string,
): Promise<number | null> {
  const trialEnd = stripeTrialEndFromProfile(profile);
  if (!trialEnd || profile.subscription_status !== "incomplete" || !admin) return trialEnd;
  try {
    if (await sirenAlreadyUsedTrial(admin, profile.siren, profileId)) return null;
  } catch (e) {
    console.error("[trial] vérification essai unique", e);
  }
  return trialEnd;
}
