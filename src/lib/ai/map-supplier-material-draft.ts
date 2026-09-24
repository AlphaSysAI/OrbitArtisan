import type { MatchedSupplierMaterial } from "@/lib/ai/quote-from-chat-schema";
import type { AiSupplierMaterialDraft } from "@/lib/ai/quote-draft-storage";

function formatPriceEur(price: number): string {
  return price.toFixed(2).replace(".", ",");
}

function resolveUnitPriceEur(row: MatchedSupplierMaterial): string {
  if (row.match && row.match.price_eur > 0) {
    return formatPriceEur(row.match.price_eur);
  }
  if (row.estimated_unit_price_eur != null && row.estimated_unit_price_eur > 0) {
    return formatPriceEur(row.estimated_unit_price_eur);
  }
  return "";
}

/** Catalogue → achat direct client ; estimation seule → ligne chiffrée sur le devis. */
function resolveExcludeFromInvoice(row: MatchedSupplierMaterial): boolean {
  if (row.match) return true;
  return false;
}

export function mapSupplierMaterialRowToDraft(
  row: MatchedSupplierMaterial,
  id: string,
): AiSupplierMaterialDraft {
  const unitPriceEur = resolveUnitPriceEur(row);
  const excludeFromInvoice = resolveExcludeFromInvoice(row);

  if (row.match) {
    return {
      id,
      label: row.match.title,
      quantity: row.quantity,
      unitPriceEur,
      supplierProductId: row.match.id,
      supplierUrl: row.match.url,
      supplierSku: row.match.sku,
      excludeFromInvoice,
      similarity: row.match.similarity,
      requestedName: row.requested_name,
      specifications: row.specifications,
    };
  }

  return {
    id,
    label: row.requested_name,
    quantity: row.quantity,
    unitPriceEur,
    supplierProductId: null,
    supplierUrl: null,
    supplierSku: null,
    excludeFromInvoice,
    similarity: null,
    requestedName: row.requested_name,
    specifications: row.specifications,
  };
}
