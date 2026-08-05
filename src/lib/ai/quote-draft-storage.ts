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
};

export type AiQuoteDraft = {
  version: 1;
  conversationId: string;
  generatedAt: string;
  matchedServiceIds: string[];
  laborDurationMinutes: number;
  notes: string;
  supplierMaterials: AiSupplierMaterialDraft[];
  warnings: string[];
};

const STORAGE_PREFIX = "alphasys-ai-quote-draft:";

export function aiQuoteDraftKey(conversationId: string): string {
  return `${STORAGE_PREFIX}${conversationId}`;
}

export function saveAiQuoteDraft(draft: AiQuoteDraft): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(aiQuoteDraftKey(draft.conversationId), JSON.stringify(draft));
}

export function loadAiQuoteDraft(conversationId: string): AiQuoteDraft | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(aiQuoteDraftKey(conversationId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AiQuoteDraft;
    if (parsed?.version !== 1 || parsed.conversationId !== conversationId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearAiQuoteDraft(conversationId: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(aiQuoteDraftKey(conversationId));
}
