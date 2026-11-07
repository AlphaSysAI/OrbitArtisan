/**
 * Fiche technique : aide-mémoire pas à pas pour un professionnel du bâtiment.
 * Même format pour les fiches de la bibliothèque SolineBTP et celles générées par l'IA.
 */

export type TechnicalSheetStep = {
  title: string;
  /** Actions de l'étape, dans l'ordre. */
  details: string[];
  /** Point de vigilance de l'étape (erreur fréquente, risque). */
  warning?: string;
};

export type TechnicalSheetNorm = {
  /** Référence du texte, ex. « NF C 15-100 » ou « DTU 25.41 ». */
  ref: string;
  /** Ce que le texte encadre, en quelques mots (jamais un extrait de la norme). */
  label: string;
};

export type TechnicalSheetContent = {
  title: string;
  /** Une à deux phrases : ce que couvre la fiche. */
  summary: string;
  /** Durée indicative pour un professionnel, ex. « 1 jour ». */
  duration?: string;
  tools: string[];
  materials: string[];
  /** Consignes de sécurité avant de commencer. */
  safety: string[];
  steps: TechnicalSheetStep[];
  /** Contrôles de fin de travaux. */
  checks: string[];
  norms: TechnicalSheetNorm[];
};

/** Fiche de la bibliothèque SolineBTP (contenu versionné dans le code). */
export type LibraryTechnicalSheet = TechnicalSheetContent & {
  /** Identifiant stable (stocké en base pour la relecture). */
  id: string;
  tradeCategoryId: string;
  /** Métiers concernés dans la famille (vide = toute la famille). */
  tradeIds: string[];
  /** Mots-clés de recherche en plus du titre. */
  keywords: string[];
};

export type SheetReviewStatus = "verified" | "needs_changes";

export type SheetReview = {
  sheetId: string;
  status: SheetReviewStatus;
  reviewerName: string | null;
  note: string | null;
  reviewedAt: string;
};
