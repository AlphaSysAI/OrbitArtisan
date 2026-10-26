import { artisanNeedsOnboarding } from "@/lib/auth/artisan-onboarding";
import {
  evaluateSubscriptionAccess,
  isSubscriptionDocumentBlockedPath,
  subscriptionBlockRedirectReason,
} from "@/lib/billing/subscription-access";

type ArtisanAccessProfile = Parameters<typeof artisanNeedsOnboarding>[0] &
  Parameters<typeof evaluateSubscriptionAccess>[0];

export type AppRedirect = { pathname: string; search: string };

/**
 * Aiguillage d'un artisan dans /app (module pur, testé contre les boucles).
 * Ordre : onboarding → compte suspendu → formule à choisir → documents bloqués.
 *
 * Pendant l'onboarding, AUCUNE autre règle ne s'applique : sans cela, /app/onboarding
 * renvoyait vers le choix de formule (abonnement « incomplete ») qui renvoyait vers
 * l'onboarding — boucle de redirections (ERR_TOO_MANY_REDIRECTS) sur tout /app.
 */
export function artisanAppRedirect(pathname: string, profile: ArtisanAccessProfile | null | undefined): AppRedirect | null {
  if (!profile || pathname === "/app/suspended") return null;

  if (artisanNeedsOnboarding(profile)) {
    return pathname === "/app/onboarding" || pathname.startsWith("/app/onboarding/")
      ? null
      : { pathname: "/app/onboarding", search: "" };
  }

  if (profile.account_status === "suspended" || profile.deleted_at) {
    return { pathname: "/app/suspended", search: "" };
  }

  // Aucun essai sans carte : tant que l'essai Stripe n'est pas démarré, seul le choix de
  // formule (Réglages → Abonnement) est accessible.
  if (profile.subscription_status === "incomplete" && !pathname.startsWith("/app/reglages")) {
    return { pathname: "/app/reglages", search: "?tab=abonnement&reason=no_subscription" };
  }

  if (isSubscriptionDocumentBlockedPath(pathname)) {
    const access = evaluateSubscriptionAccess(profile);
    if (!access.allowed) {
      return {
        pathname: "/app/reglages",
        search: `?tab=abonnement&reason=${subscriptionBlockRedirectReason(access.reason ?? "trial_expired")}`,
      };
    }
  }
  return null;
}
