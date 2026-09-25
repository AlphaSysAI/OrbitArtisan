/**
 * Programme « Tarif ambassadeur » : −25 % pour les 50 premiers ABONNÉS Pro/Premium.
 *
 * Le code s'enregistre sans prendre de place ; la place est bloquée au lancement
 * du paiement puis définitivement prise au paiement confirmé (migration 30).
 * La base fait foi pour les places et la date limite ; ces constantes servent à
 * l'affichage, aux CGV et aux contrôles côté serveur avant appel Stripe.
 */
import type { SubscriptionPlanId } from "@/lib/billing/subscription-plans";

export const AMBASSADOR_PROGRAM = {
  code: "AMBASSADEUR",
  label: "Tarif ambassadeur",
  maxSlots: 50,
  discountPercent: 25,
  eligiblePlans: ["pro", "premium"] as readonly SubscriptionPlanId[],
  /** Date limite de paiement de l'abonnement (inclusive), heure de Paris. */
  endsAtIso: "2026-11-30T23:59:59+01:00",
  endsAtLabel: "30 novembre 2026",
  /** Durée de blocage d'une place pendant le paiement (session Stripe : 30 min). */
  holdMinutes: 35,
  checkoutSessionMinutes: 30,
} as const;

export type PromoEnrollmentStatus = "registered" | "pending" | "active" | "lapsed" | "forfeited";

export type PromoEnrollment = {
  programCode: string;
  status: PromoEnrollmentStatus;
};

export type PromoProgramStatus = {
  remainingSlots: number;
  isOpen: boolean;
};

/** Résultat de l'enregistrement du code (inscription ou Réglages). */
export type PromoClaimResult =
  | "registered"
  | "already_enrolled"
  | "full"
  | "expired"
  | "invalid"
  | "no_profile";

/** Résultat du blocage de place au lancement du paiement. */
export type PromoReserveResult = "reserved" | "not_enrolled" | "already_used" | "lapsed" | "full" | "expired";

const PROMO_CODE_PATTERN = /^[A-Z0-9-]{3,32}$/;

/** Normalise une saisie utilisateur (« ambassadeur  » → « AMBASSADEUR »). Null si invalide. */
export function normalizePromoCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (!code) return null;
  return PROMO_CODE_PATTERN.test(code) ? code : null;
}

export function isPlanEligibleForAmbassador(planId: SubscriptionPlanId): boolean {
  return AMBASSADOR_PROGRAM.eligiblePlans.includes(planId);
}

/** Code enregistré, remise pas encore consommée ni perdue : on tente le checkout remisé. */
export function shouldAttemptAmbassadorCheckout(
  enrollment: PromoEnrollment | null,
  planId: SubscriptionPlanId,
): boolean {
  return (
    !!enrollment &&
    enrollment.programCode === AMBASSADOR_PROGRAM.code &&
    (enrollment.status === "registered" || enrollment.status === "pending") &&
    isPlanEligibleForAmbassador(planId)
  );
}

export function isPromoClaimResult(value: unknown): value is PromoClaimResult {
  return (
    value === "registered" ||
    value === "already_enrolled" ||
    value === "full" ||
    value === "expired" ||
    value === "invalid" ||
    value === "no_profile"
  );
}

export function isPromoReserveResult(value: unknown): value is PromoReserveResult {
  return (
    value === "reserved" ||
    value === "not_enrolled" ||
    value === "already_used" ||
    value === "lapsed" ||
    value === "full" ||
    value === "expired"
  );
}

export function promoClaimMessage(result: PromoClaimResult): string {
  switch (result) {
    case "registered":
      return `Code enregistré : −${AMBASSADOR_PROGRAM.discountPercent} % sur Pro et Premium si vous vous abonnez avant le ${AMBASSADOR_PROGRAM.endsAtLabel}, dans la limite des ${AMBASSADOR_PROGRAM.maxSlots} places.`;
    case "already_enrolled":
      return "Une offre est déjà rattachée à votre compte.";
    case "full":
      return `Les ${AMBASSADOR_PROGRAM.maxSlots} places ambassadeur sont toutes attribuées.`;
    case "expired":
      return `L'offre ambassadeur a pris fin le ${AMBASSADOR_PROGRAM.endsAtLabel}.`;
    case "no_profile":
      return "Complétez d'abord votre profil artisan.";
    case "invalid":
    default:
      return "Code inconnu ou inactif.";
  }
}
