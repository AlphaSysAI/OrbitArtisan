/** Grille tarifaire Soline — source unique pour landing, CGU et billing. */

export type SubscriptionPlanId = "base" | "pro" | "premium";
export type BillingInterval = "monthly" | "annual";

export type SubscriptionPlan = {
  id: SubscriptionPlanId;
  name: string;
  priceMonthlyHtEur: number;
  priceAnnualHtEur: number;
  solineMinutesIncluded: number;
  /** Mises en demeure LRAR incluses par mois (affranchissement offert). */
  formalNoticesIncluded: number;
  description: string;
  features: string[];
  popular?: boolean;
};

export type SolineRechargePack = {
  id: "60" | "150";
  minutes: number;
  priceHtEur: number;
  label: string;
};

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
    name: "Base",
    priceMonthlyHtEur: 44.9,
    priceAnnualHtEur: 449.9,
    solineMinutesIncluded: 0,
    formalNoticesIncluded: FORMAL_NOTICES_INCLUDED_PER_MONTH,
    description: "Tout le SaaS BTP pour gérer votre activité au quotidien.",
    features: [...SHARED_SAAS_FEATURES, "Sans secrétaire vocale Soline"],
  },
  {
    id: "pro",
    name: "Pro",
    priceMonthlyHtEur: 69.9,
    priceAnnualHtEur: 699.9,
    solineMinutesIncluded: 60,
    formalNoticesIncluded: FORMAL_NOTICES_INCLUDED_PER_MONTH,
    description: "Le plan Base avec Soline, votre secrétaire vocale IA.",
    features: [
      ...SHARED_SAAS_FEATURES,
      "Soline — secrétaire vocale IA",
      "60 min d'appels incluses / mois",
      "Prise de RDV automatique",
    ],
    popular: true,
  },
  {
    id: "premium",
    name: "Premium",
    priceMonthlyHtEur: 99.9,
    priceAnnualHtEur: 999.9,
    solineMinutesIncluded: 150,
    formalNoticesIncluded: FORMAL_NOTICES_INCLUDED_PER_MONTH,
    description: "Le plan Base avec plus de minutes Soline pour les artisans très sollicités.",
    features: [
      ...SHARED_SAAS_FEATURES,
      "Soline — secrétaire vocale IA",
      "150 min d'appels incluses / mois",
      "Prise de RDV automatique",
    ],
  },
];

export function formatPriceHtEur(amount: number): string {
  return amount.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function getPlanPriceHtEur(planId: SubscriptionPlanId, interval: BillingInterval): number {
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

export function getPlanVoiceMinutes(planId: SubscriptionPlanId): number {
  const plan = SUBSCRIPTION_PLANS.find((item) => item.id === planId);
  return plan?.solineMinutesIncluded ?? 0;
}

export function findSubscriptionPlan(planId: string): SubscriptionPlan | undefined {
  return SUBSCRIPTION_PLANS.find((item) => item.id === planId);
}

export const SOLINE_RECHARGE_PACKS: SolineRechargePack[] = [
  {
    id: "60",
    minutes: 60,
    priceHtEur: 39,
    label: "Pack 60 min",
  },
  {
    id: "150",
    minutes: 150,
    priceHtEur: 79,
    label: "Pack 150 min",
  },
];
