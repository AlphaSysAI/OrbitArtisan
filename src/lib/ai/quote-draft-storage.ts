import type { AiLaborItem } from "@/lib/quotes/ai-labor-items";

/** Brouillon de devis généré par IA — stocké côté client (sessionStorage) avant validation. */

export type AiSupplierMaterialDraft = {
  id: string;
  label: string;
  quantity: number;
  unitPriceEur: string;
  supplierProductId: string | null;
  supplierUrl: string | null;
  supplierSku: string | null;
  excludeFromInvoice: boolean;
  similarity: number | null;
  requestedName: string;
  specifications: string | null;
  /** Unité marchande du métré (m², ml, sacs…), persistée avec la ligne. */
  unit?: string | null;
};

export type AiQuoteDraft = {
  version: 1;
  /** Clé sessionStorage (id conversation ou draftKey assistant). */
  draftKey: string;
  /** @deprecated alias de draftKey pour les brouillons messagerie. */
  conversationId?: string;
  generatedAt: string;
  matchedServiceIds: string[];
  laborDurationMinutes: number;
  /**
   * Phases de main-d'œuvre proposées par l'IA (une ligne par étape). Absent sur les
   * anciens brouillons : repli sur laborDurationMinutes en une ligne.
   */
  laborItems?: AiLaborItem[];
  notes: string;
  supplierMaterials: AiSupplierMaterialDraft[];
  warnings: string[];
  customerName?: string | null;
  customerEmail?: string | null;
  customerUserId?: string | null;
  /** Origine du brouillon (assistant dictée vs lead qualifié vs appel vocal). */
  source?: "assistant" | "lead" | "voice";
  leadMatchId?: string | null;
  voiceIntakeId?: string | null;
  estimateMin?: number | null;
  estimateMax?: number | null;
  /**
   * Montant de main-d'œuvre imposé par l'artisan (ex. dicté : « main-d'œuvre à 400 € »).
   * Prioritaire sur taux × durée ; le taux affiché est recalculé pour rester cohérent.
   */
  laborTotalOverrideCents?: number | null;
  /** Version précédente (annulation d'une correction vocale, un seul niveau). */
  previous?: Omit<AiQuoteDraft, "previous"> | null;
};

const STORAGE_PREFIX = "alphasys-ai-quote-draft:";

function resolveDraftKey(draft: Pick<AiQuoteDraft, "draftKey" | "conversationId">): string {
  return draft.draftKey || draft.conversationId || "";
}

function aiQuoteDraftKey(draftKey: string): string {
  return `${STORAGE_PREFIX}${draftKey}`;
}

export function saveAiQuoteDraft(draft: AiQuoteDraft): void {
  if (typeof window === "undefined") return;
  const key = resolveDraftKey(draft);
  if (!key) return;
  const normalized: AiQuoteDraft = {
    ...draft,
    draftKey: key,
    conversationId: draft.conversationId ?? key,
  };
  sessionStorage.setItem(aiQuoteDraftKey(key), JSON.stringify(normalized));
}

export function loadAiQuoteDraft(draftKey: string): AiQuoteDraft | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(aiQuoteDraftKey(draftKey));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AiQuoteDraft;
    if (parsed?.version !== 1) return null;
    const key = resolveDraftKey(parsed);
    if (key !== draftKey) return null;
    return { ...parsed, draftKey: key };
  } catch {
    return null;
  }
}

export function clearAiQuoteDraft(draftKey: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(aiQuoteDraftKey(draftKey));
}
