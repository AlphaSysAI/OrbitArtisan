import { mapSupplierMaterialRowToDraft } from "@/lib/ai/map-supplier-material-draft";
import type { GenerateQuoteFromChatResponse } from "@/lib/ai/quote-from-chat-schema";
import type { AiOuvrageDraft, AiQuoteDraft } from "@/lib/ai/quote-draft-storage";
import { laborItemsFromAi } from "@/lib/quotes/ai-labor-items";

function draftRowId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function mapOuvrageLinesToDraft(data: GenerateQuoteFromChatResponse): AiOuvrageDraft[] {
  return (data.ouvrage_lines ?? []).map((o) => ({
    id: draftRowId(),
    label: o.title,
    description: o.description,
    quantity: o.quantity,
    unit: o.unit,
    unitPriceEur: o.unit_price_eur.toFixed(2).replace(".", ","),
    vatRate: o.vat_rate,
    source: o.source,
  }));
}

export function mapApiResponseToDraft(
  draftKey: string,
  data: GenerateQuoteFromChatResponse,
  extras?: {
    customerName?: string | null;
    customerEmail?: string | null;
    customerUserId?: string | null;
    conversationId?: string | null;
  },
): AiQuoteDraft {
  const supplierMaterials = data.supplier_materials.map((row) =>
    mapSupplierMaterialRowToDraft(row, draftRowId()),
  );

  return {
    version: 1,
    draftKey,
    conversationId: extras?.conversationId ?? draftKey,
    generatedAt: new Date().toISOString(),
    matchedServiceIds: data.matched_service_ids,
    laborDurationMinutes: data.labor_duration_minutes,
    laborItems: laborItemsFromAi(data.labor_items),
    notes: data.notes,
    supplierMaterials,
    ouvrageLines: mapOuvrageLinesToDraft(data),
    warnings: data.warnings,
    customerName: extras?.customerName ?? null,
    customerEmail: extras?.customerEmail ?? null,
    customerUserId: extras?.customerUserId ?? null,
  };
}
