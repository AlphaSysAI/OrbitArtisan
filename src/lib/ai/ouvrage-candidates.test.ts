import { describe, expect, it } from "vitest";

import type { PlatformWorkItem } from "@/lib/work-library/platform-catalog-types";

import {
  matchOuvrageByLabel,
  ouvrageLineVatRate,
  resolveOuvrageLines,
  shortlistOuvrages,
  type LibraryWorkItemRow,
} from "./ouvrage-candidates";

const soline = (p: Partial<PlatformWorkItem>): PlatformWorkItem => ({
  id: p.reference!.toLowerCase(),
  tradeCategoryId: "second-oeuvre",
  tradeIds: [],
  workCategory: "Carrelage",
  reference: "SO-CAR-101",
  title: "",
  description: "",
  unit: "m²",
  unitPriceHt: 50,
  defaultVatRate: 10,
  laborCost: 20,
  materialCost: 15,
  estimatedHours: 0.5,
  ...p,
});

const catalog = [
  soline({ reference: "SO-CAR-101", title: "Pose carrelage sol 60×60 collé", unitPriceHt: 62 }),
  soline({ reference: "SO-CAR-102", title: "Faïence murale 20×20 collée", unitPriceHt: 55 }),
  soline({ reference: "SO-PEI-101", title: "Peinture plafond deux couches", unitPriceHt: 24, workCategory: "Peinture" }),
  soline({ reference: "SO-ISO-101", title: "Isolation combles perdus soufflée R ≥ 7", unitPriceHt: 32, defaultVatRate: 5.5 }),
];

const library: LibraryWorkItemRow[] = [
  { reference: "MAISON-1", title: "Pose carrelage sol grand format", description: "Mon prix", unit: "m²", unit_price_ht: "58", default_vat_rate: "10" },
  { reference: null, title: "Pose carrelage sans prix", description: null, unit: "m²", unit_price_ht: 0, default_vat_rate: 10 },
];

describe("shortlistOuvrages", () => {
  const list = shortlistOuvrages("Refaire le carrelage du séjour en 60x60, 28 m²", library, catalog);

  it("bibliothèque d'abord (clés B…), puis Soline (S…), sans ouvrage à 0 €", () => {
    expect(list[0]).toMatchObject({ key: "B1", source: "library", unitPriceHt: 58 });
    expect(list.some((c) => c.title === "Pose carrelage sans prix")).toBe(false);
    expect(list.find((c) => c.source === "soline")?.reference).toBe("SO-CAR-101");
  });

  it("écarte les ouvrages sans rapport avec la demande", () => {
    expect(list.some((c) => c.reference === "SO-PEI-101")).toBe(false);
  });

  it("ne repropose pas un ouvrage Soline déjà importé en bibliothèque", () => {
    const withImport = shortlistOuvrages("carrelage 60x60", [{ ...library[0]!, reference: "SO-CAR-101" }], catalog);
    expect(withImport.filter((c) => c.reference === "SO-CAR-101")).toHaveLength(1);
    expect(withImport.find((c) => c.reference === "SO-CAR-101")?.source).toBe("library");
  });
});

describe("resolveOuvrageLines", () => {
  const candidates = shortlistOuvrages("carrelage 60x60 et isolation des combles", library, catalog);

  it("prix, unité et TVA viennent de la source ; m² gardés à 2 décimales", () => {
    const s = candidates.find((c) => c.reference === "SO-CAR-101")!;
    const [line] = resolveOuvrageLines([{ key: s.key, quantity: 27.437 }], candidates);
    expect(line).toMatchObject({ source: "soline", unitPriceEur: 62, unit: "m²", quantity: 27.44, requestedQuantity: 27.437, vatRate: 10 });
  });

  it("ignore clé inconnue, quantité nulle et doublon", () => {
    expect(
      resolveOuvrageLines(
        [
          { key: "Z9", quantity: 3 },
          { key: "B1", quantity: 0 },
          { key: "b1", quantity: 10 },
          { key: "B1", quantity: 12 },
        ],
        candidates,
      ),
    ).toHaveLength(1);
  });

  it("écarte un ouvrage déjà couvert par le métré (pas de double comptage)", () => {
    expect(resolveOuvrageLines([{ key: "B1", quantity: 20 }], candidates, ["Pose du carrelage"])).toHaveLength(0);
  });
});

describe("matchOuvrageByLabel", () => {
  it("même unité et libellé proche → ouvrage", () => {
    expect(matchOuvrageByLabel("Pose carrelage 60x60 collé", "m2", catalog)?.reference).toBe("SO-CAR-101");
  });

  it("unité différente ou libellé trop vague → null", () => {
    expect(matchOuvrageByLabel("Pose carrelage 60x60 collé", "U", catalog)).toBeNull();
    expect(matchOuvrageByLabel("Carrelage", "m²", catalog)).toBeNull();
  });
});

describe("ouvrageLineVatRate", () => {
  it("suit le taux du devis, sauf 5,5 % rénovation énergétique (hors franchise)", () => {
    expect(ouvrageLineVatRate(10, "20")).toBe("");
    expect(ouvrageLineVatRate(20, "10")).toBe("");
    expect(ouvrageLineVatRate(5.5, "10")).toBe("5.5");
    expect(ouvrageLineVatRate(5.5, "0")).toBe("");
  });
});
