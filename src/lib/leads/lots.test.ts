import { describe, expect, it } from "vitest";

import { leadViewForLot, lotLabel, parseLeadLots } from "./lots";

const lead = {
  trade_category: "gros-oeuvre",
  trade: "macon",
  description: "Construction maison neuve 125 m² avec toiture tuiles et salle de bain.",
  estimate_min: 150000,
  estimate_max: 190000,
  ai_qualification: null,
};

describe("lots d'une demande", () => {
  it("valide contre la nomenclature et dédoublonne", () => {
    const lots = parseLeadLots([
      { trade_category: "gros-oeuvre", trade: "macon", summary: "Gros œuvre" },
      { trade_category: "gros-oeuvre", trade: "macon", summary: "doublon" },
      { trade_category: "couverture", trade: "couvreur", summary: "Toiture tuiles" },
      { trade_category: "inconnu", trade: null, summary: "x" },
      { trade_category: "couverture", trade: "plombier", summary: "métier hors catégorie" },
    ]);
    expect(lots.map((l) => l.trade)).toEqual(["macon", "couvreur"]);
    expect(lotLabel(lots[1]!)).toBe("Couvreur");
  });

  it("mono-métier : la demande entière et l'estimation", () => {
    const view = leadViewForLot({ ...lead, lots: [] }, 0);
    expect(view.multiLot).toBe(false);
    expect(view.description).toBe(lead.description);
    expect(view.estimateMin).toBe(150000);
  });

  it("multi-métiers : uniquement son lot, sans estimation globale", () => {
    const view = leadViewForLot(
      {
        ...lead,
        lots: [
          { trade_category: "gros-oeuvre", trade: "macon", summary: "Fondations et murs, maison 125 m²" },
          { trade_category: "couverture", trade: "couvreur", summary: "Charpente et couverture tuiles 135 m²" },
        ],
      },
      1,
    );
    expect(view).toMatchObject({
      multiLot: true,
      trade: "couvreur",
      description: "Charpente et couverture tuiles 135 m²",
      otherLotLabels: ["Maçon"],
      estimateMin: null,
    });
  });
});
