import type Stripe from "stripe";

/**
 * Managed Payments (Stripe marchand officiel) pour les abonnements SolineBTP :
 * Stripe calcule, collecte et reverse la TVA, et émet les factures. Les Payment
 * Links du compte l'avaient déjà activé ; les sessions créées par l'application
 * doivent le demander explicitement.
 *
 * Le SDK installé ne type pas encore ce paramètre : il est ajouté tel quel, avec
 * la version d'API qui l'introduit (2026-04-22.dahlia, celle du webhook).
 */
export const MANAGED_PAYMENTS = {
  managed_payments: { enabled: true },
} as unknown as Partial<Stripe.Checkout.SessionCreateParams>;

export const MANAGED_PAYMENTS_REQUEST: Stripe.RequestOptions = {
  apiVersion: "2026-04-22.dahlia",
};
