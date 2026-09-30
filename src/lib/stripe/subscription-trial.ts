import { TRIAL_DURATION_DAYS } from "@/lib/billing/subscription-access";

/**
 * Essai gratuit = abonnement Stripe en essai, carte obligatoire (0 € aujourd'hui,
 * premier prélèvement automatique à la fin de l'essai).
 * - Compte « incomplete » (jamais abonné) : essai complet de TRIAL_DURATION_DAYS jours.
 * - Ancien essai local sans carte (« trialing » sans abonnement Stripe) : jusqu'à sa fin prévue.
 * - Sinon (résilié, essai déjà consommé) : pas d'essai, prélèvement immédiat.
 *
 * Stripe exige un trial_end à au moins 48 h : en deçà, abonnement immédiat.
 */
const STRIPE_MIN_TRIAL_MS = 48 * 3600_000 + 5 * 60_000;

export function stripeTrialEndFromProfile(
  profile: { subscription_status?: string | null; trial_ends_at?: string | null },
  now = Date.now(),
): number | null {
  if (profile.subscription_status === "incomplete") {
    return Math.floor((now + TRIAL_DURATION_DAYS * 86_400_000) / 1000);
  }
  if (profile.subscription_status !== "trialing" || !profile.trial_ends_at) return null;
  const ends = new Date(profile.trial_ends_at).getTime();
  if (!Number.isFinite(ends) || ends - now < STRIPE_MIN_TRIAL_MS) return null;
  return Math.floor(ends / 1000);
}
