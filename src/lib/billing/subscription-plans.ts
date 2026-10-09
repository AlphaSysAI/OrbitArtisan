/** Grille tarifaire Soline — source unique pour landing, CGV/CGU, quota vocal et billing. */

export type SubscriptionPlanId = "base" | "pro" | "premium";
export type BillingInterval = "monthly" | "annual";

export type SubscriptionPlan = {
  id: SubscriptionPlanId;
  name: string;
  priceMonthlyHtEur: number;
  priceAnnualHtEur: number;
  /** Appels Soline inclus par mois civil (0 = pas de secrétaire vocale). */
  solineCallsIncluded: number;
  /** Prix HT d'un appel au-delà du forfait, en centimes (0 = pas de voix). */
  solineOverageCallCents: number;
  /** Mises en demeure LRAR incluses par mois (affranchissement offert). */
  formalNoticesIncluded: number;
  description: string;
  features: string[];
  popular?: boolean;
};

/**
 * Règles de décompte d'un appel Soline :
 * - seul un appel `completed` d'au moins 30 s compte (raccrochés, faux numéros exclus) ;
 * - l'agent conclut l'appel au bout de 8 min (plafond de coût, réglé côté ElevenLabs).
 */
export const SOLINE_BILLABLE_CALL_MIN_SECONDS = 30;
export const SOLINE_CALL_MAX_DURATION_SECONDS = 8 * 60;

/** Plafond de dépassement par défaut (modifiable par l'artisan), en centimes HT. */
export const SOLINE_DEFAULT_OVERAGE_CAP_CENTS = 3000;

/** Appels inclus pendant l'essai gratuit (formule Pro), sans dépassement possible. */
export const SOLINE_TRIAL_CALLS_INCLUDED = 10;

/**
 * LRAR offertes par mois civil, identique sur tous les plans.
 * Le quota non consommé n'est pas reportable au mois suivant.
 */
export const FORMAL_NOTICES_INCLUDED_PER_MONTH = 1;

/**
 * Au-delà du quota mensuel, l'affranchissement du recommandé est refacturé à
 * l'artisan : Soline ne marge pas sur le tarif postal.
 */
export const FORMAL_NOTICE_OVERAGE_NOTICE =
  "Au-delà, chaque recommandé est refacturé au tarif La Poste en vigueur, sans marge.";

const SHARED_SAAS_FEATURES = [
  "Tout le SaaS BTP (devis, factures, RDV, chantiers…)",
  "Devis illimités",
  "Relances automatiques et recouvrement d'impayés",
  "1 mise en demeure LRAR incluse / mois (non cumulable)",
  "1 utilisateur",
] as const;

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: "base",
    name: "Essentiel",
    priceMonthlyHtEur: 49,
    priceAnnualHtEur: 490,
    solineCallsIncluded: 0,
    solineOverageCallCents: 0,
    formalNoticesIncluded: FORMAL_NOTICES_INCLUDED_PER_MONTH,
    description: "Tout le SaaS BTP pour gérer votre activité au quotidien.",
    features: [...SHARED_SAAS_FEATURES, "Sans secrétaire vocale Soline"],
  },
  {
    id: "pro",
    name: "Pro",
    priceMonthlyHtEur: 99,
    priceAnnualHtEur: 990,
    solineCallsIncluded: 40,
    solineOverageCallCents: 90,
    formalNoticesIncluded: FORMAL_NOTICES_INCLUDED_PER_MONTH,
    description: "Le plan Essentiel avec Soline, votre secrétaire vocale IA.",
    features: [
      ...SHARED_SAAS_FEATURES,
      "Soline — secrétaire vocale IA",
      "40 appels inclus / mois",
      "Prise de RDV sur vos plages de visite (vous validez)",
      "Au-delà : 0,90 € HT / appel, sans coupure",
    ],
    popular: true,
  },
  {
    id: "premium",
    name: "Premium",
    priceMonthlyHtEur: 149,
    priceAnnualHtEur: 1490,
    solineCallsIncluded: 100,
    solineOverageCallCents: 70,
    formalNoticesIncluded: FORMAL_NOTICES_INCLUDED_PER_MONTH,
    description: "Le plan Pro pour les artisans très sollicités au téléphone.",
    features: [
      ...SHARED_SAAS_FEATURES,
      "Soline — secrétaire vocale IA",
      "100 appels inclus / mois",
      "Prise de RDV sur vos plages de visite (vous validez)",
      "Au-delà : 0,70 € HT / appel, sans coupure",
    ],
  },
];

export function formatPriceHtEur(amount: number): string {
  return amount.toLocaleString("fr-FR", {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export function formatCentsHtEur(cents: number): string {
  return formatPriceHtEur(cents / 100);
}

function getPlanPriceHtEur(planId: SubscriptionPlanId, interval: BillingInterval): number {
  const plan = SUBSCRIPTION_PLANS.find((item) => item.id === planId);
  if (!plan) return 0;
  return interval === "annual" ? plan.priceAnnualHtEur : plan.priceMonthlyHtEur;
}

export function getPlanMrrCents(planId: SubscriptionPlanId): number {
  return Math.round(getPlanPriceHtEur(planId, "monthly") * 100);
}

export function getPlanAnnualSavingsPercent(plan: SubscriptionPlan): number {
  const monthlyTotal = plan.priceMonthlyHtEur * 12;
  if (monthlyTotal <= 0) return 0;
  return Math.round(((monthlyTotal - plan.priceAnnualHtEur) / monthlyTotal) * 100);
}

export function getPlanVoiceCalls(planId: SubscriptionPlanId): number {
  const plan = SUBSCRIPTION_PLANS.find((item) => item.id === planId);
  return plan?.solineCallsIncluded ?? 0;
}

export function getPlanOverageCallCents(planId: SubscriptionPlanId): number {
  const plan = SUBSCRIPTION_PLANS.find((item) => item.id === planId);
  return plan?.solineOverageCallCents ?? 0;
}

export function findSubscriptionPlan(planId: string): SubscriptionPlan | undefined {
  return SUBSCRIPTION_PLANS.find((item) => item.id === planId);
}

export function isSubscriptionPlanId(value: string | null | undefined): value is SubscriptionPlanId {
  return value === "base" || value === "pro" || value === "premium";
}
