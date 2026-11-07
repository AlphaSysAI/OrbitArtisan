import type { TechnicalSheetContent } from "@/lib/technical-sheets/types";

/** Grandes familles de pannes, côté particulier. */
export type ClientSheetDomain = "eau" | "electricite" | "chauffage" | "murs-sols" | "ouvertures" | "exterieur";

export const CLIENT_SHEET_DOMAINS: { id: ClientSheetDomain; label: string; emoji: string }[] = [
  { id: "eau", label: "Eau & plomberie", emoji: "💧" },
  { id: "electricite", label: "Électricité", emoji: "⚡" },
  { id: "chauffage", label: "Chauffage & gaz", emoji: "🔥" },
  { id: "murs-sols", label: "Murs, sols & humidité", emoji: "🧱" },
  { id: "ouvertures", label: "Portes, fenêtres & volets", emoji: "🚪" },
  { id: "exterieur", label: "Toiture & extérieur", emoji: "🏠" },
];

/**
 * « urgence » : gestes de sécurité à faire tout de suite.
 * « facile » : petit dépannage sans outil particulier.
 * « bricolage » : demande un peu d'outillage et de soin.
 */
export type ClientSheetLevel = "urgence" | "facile" | "bricolage";

export const CLIENT_LEVEL_LABEL: Record<ClientSheetLevel, string> = {
  urgence: "Urgence",
  facile: "Facile",
  bricolage: "Petit bricolage",
};

/** Fiche dépannage pour particulier : sécuriser, diagnostiquer, petits gestes, puis le pro. */
export type ClientTechnicalSheet = TechnicalSheetContent & {
  id: string;
  domain: ClientSheetDomain;
  level: ClientSheetLevel;
  keywords: string[];
  /** Signes qui imposent d'arrêter et d'appeler un professionnel. */
  whenToCallPro: string[];
  /** Métier à contacter pour la mise en relation. */
  proTrade: { categoryId: string; tradeId: string };
};
