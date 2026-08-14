/** Grille tarifaire Soline — source unique pour landing, CGU et futur billing. */

export type SubscriptionPlanId = "base" | "pro" | "premium";

export type SubscriptionPlan = {
  id: SubscriptionPlanId;
  name: string;
  priceHtEur: number;
  solineMinutesIncluded: number;
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

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: "base",
    name: "Base",
    priceHtEur: 39,
    solineMinutesIncluded: 0,
    description: "Tout le SaaS BTP pour gérer votre activité au quotidien.",
    features: ["Tout le SaaS BTP", "Devis illimités", "1 utilisateur"],
  },
  {
    id: "pro",
    name: "Pro",
    priceHtEur: 69,
    solineMinutesIncluded: 60,
    description: "Le plan Base avec Soline, votre secrétaire vocale IA.",
    features: [
      "Tout le plan Base",
      "Soline — secrétaire vocale IA",
      "60 min d'appels incluses / mois",
      "Prise de RDV automatique",
    ],
    popular: true,
  },
  {
    id: "premium",
    name: "Premium",
    priceHtEur: 99,
    solineMinutesIncluded: 150,
    description: "Le plan Pro avec plus de minutes Soline pour les artisans très sollicités.",
    features: [
      "Tout le plan Pro",
      "Soline — secrétaire vocale IA",
      "150 min d'appels incluses / mois",
      "Priorité sur les nouveautés IA",
    ],
  },
];

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
