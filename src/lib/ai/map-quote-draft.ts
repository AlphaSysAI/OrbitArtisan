"use client";

import type { GenerateQuoteFromChatResponse } from "@/lib/ai/quote-from-chat-schema";
import {
  type AiQuoteDraft,
  type AiSupplierMaterialDraft,
  saveAiQuoteDraft,
} from "@/lib/ai/quote-draft-storage";

function draftRowId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function mapApiResponseToDraft(
  conversationId: string,
  data: GenerateQuoteFromChatResponse,
): AiQuoteDraft {
  const supplierMaterials: AiSupplierMaterialDraft[] = data.supplier_materials.map((row) => {
    if (row.match) {
      return {
        id: draftRowId(),
        label: row.match.title,
        quantity: row.quantity,
        unitPriceEur: row.match.price_eur.toFixed(2).replace(".", ","),
        supplierProductId: row.match.id,
        supplierUrl: row.match.url,
        supplierSku: row.match.sku,
        excludeFromInvoice: true,
        similarity: row.match.similarity,
        requestedName: row.requested_name,
        specifications: row.specifications,
      };
    }
    return {
      id: draftRowId(),
      label: row.requested_name,
      quantity: row.quantity,
      unitPriceEur: "",
      supplierProductId: null,
      supplierUrl: null,
      supplierSku: null,
      excludeFromInvoice: false,
      similarity: null,
      requestedName: row.requested_name,
      specifications: row.specifications,
    };
  });

  return {
    version: 1,
    conversationId,
    generatedAt: new Date().toISOString(),
    matchedServiceIds: data.matched_service_ids,
    laborDurationMinutes: data.labor_duration_minutes,
    notes: data.notes,
    supplierMaterials,
    warnings: data.warnings,
  };
}

export function persistAiQuoteDraft(draft: AiQuoteDraft): void {
  saveAiQuoteDraft(draft);
}
