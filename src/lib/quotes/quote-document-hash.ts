import { createHash } from "node:crypto";

export type QuoteHashInput = {
  quote: {
    id: string;
    quote_number: string | null;
    grand_total: number | null;
    labor_total: number | null;
    materials_total: number | null;
    reduced_vat_rate: number | null;
    valid_until: string | null;
    sent_at: string | null;
  };
  services: { service_title: string | null; duration_minutes: number | null; unit_price: number | null; line_total: number | null }[];
  materials: { label: string | null; quantity: number | null; unit_price: number | null; line_total: number | null; vat_rate: number | null; exclude_from_invoice: boolean | null }[];
};

/**
 * Empreinte SHA-256 du contenu engageant d'un devis (numéro, lignes, montants,
 * validité). Stockée à l'acceptation : prouve QUELLE version a été signée.
 * Indépendante du rendu PDF (police, logo) qui peut évoluer sans changer l'engagement.
 */
export function computeQuoteDocumentHash(input: QuoteHashInput): string {
  const canonical = {
    v: 1,
    id: input.quote.id,
    number: input.quote.quote_number,
    totals: [input.quote.labor_total ?? 0, input.quote.materials_total ?? 0, input.quote.grand_total ?? 0],
    vat: input.quote.reduced_vat_rate,
    validUntil: input.quote.valid_until,
    sentAt: input.quote.sent_at,
    services: input.services.map((s) => [s.service_title ?? "", s.duration_minutes ?? 0, s.unit_price ?? 0, s.line_total ?? 0]),
    materials: input.materials.map((m) => [
      m.label ?? "",
      m.quantity ?? 0,
      m.unit_price ?? 0,
      m.line_total ?? 0,
      m.vat_rate ?? null,
      Boolean(m.exclude_from_invoice),
    ]),
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}
