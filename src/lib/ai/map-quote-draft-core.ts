import { mapSupplierMaterialRowToDraft } from "@/lib/ai/map-supplier-material-draft";
import type { GenerateQuoteFromChatResponse } from "@/lib/ai/quote-from-chat-schema";
import type { AiQuoteDraft } from "@/lib/ai/quote-draft-storage";

function draftRowId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
    notes: data.notes,
    supplierMaterials,
    warnings: data.warnings,
    customerName: extras?.customerName ?? null,
    customerEmail: extras?.customerEmail ?? null,
    customerUserId: extras?.customerUserId ?? null,
  };
}
