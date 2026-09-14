/** Ouvrage générique du catalogue Soline (lecture seule, copiable en bibliothèque perso). */
export type PlatformWorkItem = {
  id: string;
  tradeCategoryId: string;
  /** Vide = tous les métiers de la catégorie ; sinon liste de `trade` ids (taxonomy). */
  tradeIds: string[];
  workCategory: string;
  reference: string;
  title: string;
  description: string;
  unit: string;
  unitPriceHt: number;
  defaultVatRate: number;
  laborCost: number;
  materialCost: number;
  estimatedHours: number;
};
