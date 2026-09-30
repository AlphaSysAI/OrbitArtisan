import { describe, expect, it } from "vitest";

import type { AiQuoteDraft } from "@/lib/ai/quote-draft-storage";
import { computeDraftTotals } from "@/lib/quotes/create-quote-from-ai-draft";

import { applyQuotePatch, type PatchOperation } from "./voice-patch";

const mat = (id: string, label: string, quantity: number, price: string) => ({
  id,
  label,
  quantity,
  unitPriceEur: price,
  supplierProductId: null,
  supplierUrl: null,
  supplierSku: null,
  excludeFromInvoice: false,
  similarity: null,
  requestedName: label,
  specifications: null,
});

const draft: AiQuoteDraft = {
  version: 1,
  draftKey: "k",
  generatedAt: "2026-09-30T10:00:00Z",
  matchedServiceIds: ["s1"],
  laborDurationMinutes: 480,
  notes: "Salle de bain",
  supplierMaterials: [mat("a", "Carrelage 60x60", 12, "35.00"), mat("b", "Joint gris", 2, "8.50")],
  warnings: [],
};

const op = (o: Partial<PatchOperation> & Pick<PatchOperation, "op">): PatchOperation => ({
  target: null,
  label: null,
  quantity: null,
  unit_price_eur: null,
  amount_eur: null,
  hours: null,
  text: null,
  ...o,
});

let n = 0;
const opts = { newId: () => `new-${++n}`, laborRatePerHourCents: 4000, currentLaborTotalCents: 32000 };

describe("applyQuotePatch", () => {
  it("« Ajoute 2 sacs de colle et passe la main-d'œuvre à 400 € » sans toucher aux autres lignes", () => {
    const res = applyQuotePatch(
      draft,
      {
        operations: [
          op({ op: "add_material", label: "Sac de colle carrelage", quantity: 2 }),
          op({ op: "set_labor_total", amount_eur: 400 }),
        ],
        unresolved: [],
      },
      opts,
    );
    expect(res.draft.supplierMaterials.slice(0, 2)).toEqual(draft.supplierMaterials);
    expect(res.draft.supplierMaterials[2]).toMatchObject({ label: "Sac de colle carrelage", quantity: 2, unitPriceEur: "0.00" });
    expect(res.warnings).toContain("« Sac de colle carrelage » : prix à compléter.");
    expect(res.draft.laborTotalOverrideCents).toBe(40000);

    const totals = computeDraftTotals(res.draft, 4000, new Map([["s1", 480]]))!;
    expect(totals.laborTotalCents).toBe(40000);
    expect(totals.materialsTotalCents).toBe(12 * 3500 + 2 * 850);
    expect(res.draft.previous?.supplierMaterials).toHaveLength(2);
  });

  it("modifie et supprime par référence, ignore une cible inconnue", () => {
    const res = applyQuotePatch(
      draft,
      {
        operations: [
          op({ op: "update_material", target: "L1", quantity: 15 }),
          op({ op: "remove_material", target: "L2" }),
          op({ op: "remove_material", target: "L9" }),
        ],
        unresolved: ["mets le truc là-bas"],
      },
      opts,
    );
    expect(res.draft.supplierMaterials).toHaveLength(1);
    expect(res.draft.supplierMaterials[0]).toMatchObject({ id: "a", quantity: 15, unitPriceEur: "35.00" });
    expect(res.warnings.some((w) => w.includes("L9"))).toBe(true);
    expect(res.warnings.some((w) => w.includes("Non compris"))).toBe(true);
  });

  it("rejette les valeurs aberrantes sans rien casser", () => {
    const res = applyQuotePatch(
      draft,
      { operations: [op({ op: "update_material", target: "L1", quantity: -3, unit_price_eur: 1e9 }), op({ op: "set_labor_total", amount_eur: -5 })], unresolved: [] },
      opts,
    );
    expect(res.draft.supplierMaterials).toEqual(draft.supplierMaterials);
    expect(res.changes).toHaveLength(0);
    expect(res.draft.laborTotalOverrideCents ?? null).toBeNull();
  });
});
