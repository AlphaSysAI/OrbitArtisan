import { describe, expect, it } from "vitest";

import { applyFormPatch, describeSnapshot, type FormPatchOperation, type QuoteFormSnapshot } from "./form-patch";

const base: QuoteFormSnapshot = {
  lines: [
    { id: "a", source: "supplier", label: "Tuile terre cuite", quantity: 400, unitPriceEur: 1.2 },
    { id: "b", source: "manual", label: "Écran sous-toiture", quantity: 2, unitPriceEur: 85 },
  ],
  labor: [{ id: "m", title: "Réfection toiture", hours: 40 }],
  laborRateEur: 45,
  notes: "Échafaudage compris.",
};

const op = (o: Partial<FormPatchOperation> & Pick<FormPatchOperation, "op">): FormPatchOperation => ({
  target: null,
  label: null,
  quantity: null,
  unit_price_eur: null,
  hours: null,
  text: null,
  ...o,
});

let n = 0;
const newId = () => `new-${++n}`;

describe("applyFormPatch", () => {
  it("ne modifie que les lignes visées (les autres sont recopiées telles quelles)", () => {
    const r = applyFormPatch(base, { operations: [op({ op: "update_line", target: "F1", quantity: 450 })], unresolved: [] }, newId);
    expect(r.snapshot.lines[0]).toEqual({ ...base.lines[0], quantity: 450 });
    expect(r.snapshot.lines[1]).toBe(base.lines[1]);
    expect(r.snapshot.labor).toEqual(base.labor);
    expect(r.changes).toHaveLength(1);
  });

  it("ajoute, supprime, gère la main-d'œuvre, le taux et les observations", () => {
    const r = applyFormPatch(
      base,
      {
        operations: [
          op({ op: "remove_line", target: "F2" }),
          op({ op: "add_line", label: "Closoir ventilé", quantity: 12, unit_price_eur: 6.5 }),
          op({ op: "update_labor", target: "M1", hours: 48 }),
          op({ op: "add_labor", label: "Pose gouttières", hours: 6 }),
          op({ op: "set_labor_rate", unit_price_eur: 50 }),
          op({ op: "append_note", text: "Délai : 3 semaines." }),
        ],
        unresolved: [],
      },
      newId,
    );
    expect(r.snapshot.lines.map((l) => l.label)).toEqual(["Tuile terre cuite", "Closoir ventilé"]);
    expect(r.snapshot.labor.map((l) => [l.title, l.hours])).toEqual([
      ["Réfection toiture", 48],
      ["Pose gouttières", 6],
    ]);
    expect(r.snapshot.laborRateEur).toBe(50);
    expect(r.snapshot.notes).toBe("Échafaudage compris.\nDélai : 3 semaines.");
    expect(r.warnings).toEqual([]);
  });

  it("références invalides ou valeurs absurdes : ignorées et signalées", () => {
    const r = applyFormPatch(
      base,
      {
        operations: [
          op({ op: "update_line", target: "F9", quantity: 3 }),
          op({ op: "update_line", target: "F1", quantity: -5 }),
          op({ op: "add_line", label: "Vis inox" }),
        ],
        unresolved: ["mets le même prix que l'autre"],
      },
      newId,
    );
    expect(r.snapshot.lines[0]).toBe(base.lines[0]);
    expect(r.snapshot.lines[2]).toMatchObject({ label: "Vis inox", quantity: 1, unitPriceEur: null });
    expect(r.warnings.length).toBe(5);
  });

  it("les références visent l'état d'origine même après une suppression", () => {
    const r = applyFormPatch(
      base,
      { operations: [op({ op: "remove_line", target: "F1" }), op({ op: "update_line", target: "F2", unit_price_eur: 90 })], unresolved: [] },
      newId,
    );
    expect(r.snapshot.lines).toEqual([{ ...base.lines[1], unitPriceEur: 90 }]);
  });

  it("décrit le devis avec des références courtes", () => {
    expect(describeSnapshot(base)).toContain("F2 | Écran sous-toiture | qté 2 | 85.00 € HT");
    expect(describeSnapshot(base)).toContain("M1 | Réfection toiture | 40 h");
  });
});

import { sharesKeyword } from "@/lib/ai/build-quote-from-text";

describe("correspondance catalogue", () => {
  it("exige un mot commun significatif", () => {
    expect(sharesKeyword("Tuile terre cuite", "Tuile romane terre cuite rouge")).toBe(true);
    expect(sharesKeyword("Tuiles", "Tuile mécanique")).toBe(true);
    expect(sharesKeyword("Tuile terre cuite", "Carrelage grès cérame 60x60")).toBe(false);
  });
});
