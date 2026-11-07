import { describe, expect, it } from "vitest";

import {
  findSheetsForQuestion,
  looksLikeTechnicalSheetRequest,
  looksLikeWorksiteSituation,
  sheetQueryTopic,
} from "@/lib/technical-sheets/assistant-sheet-lookup";

describe("reconnaître une demande de fiche technique", () => {
  it.each([
    "Montre-moi la fiche technique pour poser un tableau électrique",
    "tu as une fiche sur le receveur extra-plat ?",
    "Comment je raccorde un tableau électrique ?",
    "comment poser une cloison en placo",
    "quelles sont les étapes pour poser un WC suspendu",
    "mode opératoire douche à l'italienne",
  ])("« %s »", (message) => {
    expect(looksLikeTechnicalSheetRequest(message)).toBe(true);
  });

  it.each([
    "Crée un devis pour poser un tableau électrique chez Dupont",
    "Ouvre mes RDV de demain",
    "Combien de factures en attente ?",
    "comment va ma trésorerie",
  ])("ignore « %s »", (message) => {
    expect(looksLikeTechnicalSheetRequest(message)).toBe(false);
  });
});

describe("retrouver la bonne fiche", () => {
  it("tableau électrique", () => {
    const [first] = findSheetsForQuestion("Comment je raccorde un tableau électrique ?");
    expect(first?.id).toBe("elec-poser-raccorder-tableau");
  });

  it("receveur extra-plat", () => {
    expect(findSheetsForQuestion("fiche pour poser un receveur extra plat")[0]?.id).toBe("plomb-receveur-extra-plat");
  });

  it("douche à l'italienne", () => {
    expect(findSheetsForQuestion("mode opératoire douche à l'italienne")[0]?.id).toBe("carr-douche-italienne-spec");
  });

  it("WC suspendu", () => {
    expect(findSheetsForQuestion("étapes pour poser un WC suspendu")[0]?.id).toBe("plomb-wc-suspendu");
  });

  it("n'invente pas de fiche sur un sujet absent", () => {
    expect(findSheetsForQuestion("comment poser une fenêtre de toit en ardoise")).toHaveLength(0);
  });

  it("ignore les fiches retirées", () => {
    const found = findSheetsForQuestion("tableau électrique", { excludedIds: new Set(["elec-poser-raccorder-tableau"]) });
    expect(found.map((s) => s.id)).not.toContain("elec-poser-raccorder-tableau");
  });

  it("extrait le sujet pour la recherche", () => {
    expect(sheetQueryTopic("Montre-moi la fiche pour poser une fenêtre de toit")).toBe("poser fenetre toit");
  });
});

describe("situation de chantier décrite sans demander de fiche", () => {
  it.each([
    "j'ai une fuite à côté du tableau, je fais quoi ?",
    "le disjoncteur saute quand il pleut, que faire ?",
    "la peinture cloque au plafond, comment réparer ?",
    "mon carrelage sonne creux ?",
  ])("« %s »", (message) => {
    expect(looksLikeWorksiteSituation(message)).toBe(true);
  });

  it.each([
    "mon client ne répond pas, je fais quoi ?",
    "comment je fais pour inviter quelqu'un sur mon compte ?",
    "j'ai un devis refusé, que faire ?",
    "ouvre mes RDV de demain",
  ])("ignore « %s »", (message) => {
    expect(looksLikeWorksiteSituation(message)).toBe(false);
  });
});
