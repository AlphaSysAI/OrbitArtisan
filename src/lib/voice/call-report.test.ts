import { describe, expect, it } from "vitest";

import {
  isUrgentAnalysis,
  parseCallAnalysis,
  reportSummaryText,
  requiredHumanValidations,
  urgencyReason,
  type CallReportAction,
} from "./call-report";

const BASE = {
  intent: "depannage",
  summary: "Fuite sous l'évier de la cuisine, l'eau coule en continu.",
  caller: { name: "Mme Martin", email: "Martin . Claire@Exemple.FR", callback_phone: "06 12 34 56 78" },
  declared: { need: "fuite évier", location: "Lyon 3e", building: null, zone: "cuisine", dimensions: null, access: null, deadline: null, availability: "demain matin" },
  urgency: { level: "intervention_rapide", facts: ["fuite active"] },
  missing: ["numéro de rue"],
  contradictions: [],
  next_step: "RDV à confirmer par SMS",
};

describe("parseCallAnalysis", () => {
  it("normalise l'e-mail et conserve les champs déclarés", () => {
    const a = parseCallAnalysis(BASE);
    expect(a?.caller.email).toBe("martin.claire@exemple.fr");
    expect(a?.declared.location).toBe("Lyon 3e");
    expect(a?.urgency.level).toBe("intervention_rapide");
  });

  it("intention ou urgence hors liste → « inconnue » (pas d'invention de catégorie)", () => {
    const a = parseCallAnalysis({ ...BASE, intent: "vente_urgente", urgency: { level: "critique", facts: [] } });
    expect(a?.intent).toBe("inconnue");
    expect(a?.urgency.level).toBe("inconnue");
    expect(isUrgentAnalysis(a)).toBe(false);
  });

  it("e-mail invalide → null plutôt qu'une adresse fausse", () => {
    expect(parseCallAnalysis({ ...BASE, caller: { ...BASE.caller, email: "claire arobase" } })?.caller.email).toBeNull();
  });

  it("sous-objets mal formés → valeurs neutres, pas d'exception", () => {
    const a = parseCallAnalysis({ ...BASE, caller: "x", declared: 42, urgency: null, missing: "rien" });
    expect(a?.caller.name).toBeNull();
    expect(a?.declared.need).toBeNull();
    expect(a?.urgency.level).toBe("inconnue");
    expect(a?.missing).toEqual([]);
  });

  it("listes tronquées (bornes de taille)", () => {
    const a = parseCallAnalysis({ ...BASE, missing: Array.from({ length: 20 }, (_, i) => `info ${i}`) });
    expect(a?.missing).toHaveLength(6);
  });
});

describe("urgence", () => {
  it("danger et intervention rapide sont urgents, avec justification factuelle", () => {
    const a = parseCallAnalysis({ ...BASE, urgency: { level: "danger", facts: ["odeur de gaz"] } });
    expect(isUrgentAnalysis(a)).toBe(true);
    expect(urgencyReason(a)).toContain("odeur de gaz");
  });
  it("planifiable n'est pas urgent", () => {
    expect(isUrgentAnalysis(parseCallAnalysis({ ...BASE, urgency: { level: "planifiable", facts: [] } }))).toBe(false);
  });
});

describe("validations humaines", () => {
  const rdv: CallReportAction = { type: "rendez_vous", status: "en_attente_validation", label: "mardi 13 octobre à 9 h" };
  const devis: CallReportAction = { type: "brouillon_devis", status: "brouillon_a_valider", label: "Brouillon" };

  it("RDV en attente + brouillon → deux validations, pas de « rappeler »", () => {
    const v = requiredHumanValidations([rdv, devis], parseCallAnalysis(BASE));
    expect(v).toHaveLength(2);
    expect(v.join(" ")).toMatch(/Confirmer ou refuser le rendez-vous/);
    expect(v.join(" ")).not.toMatch(/Rappeler/);
  });

  it("sans RDV → rappel demandé ; contradictions signalées", () => {
    const v = requiredHumanValidations([], parseCallAnalysis({ ...BASE, contradictions: ["adresse : Lyon puis Villeurbanne"] }));
    expect(v.join(" ")).toMatch(/contradictoires/);
    expect(v.join(" ")).toMatch(/Rappeler le client/);
  });

  it("démarchage → aucun rappel imposé", () => {
    expect(requiredHumanValidations([], parseCallAnalysis({ ...BASE, intent: "demarchage" }))).toEqual([]);
  });
});

describe("reportSummaryText", () => {
  it("repli sur le texte fourni si l'analyse a échoué", () => {
    expect(reportSummaryText(null, "Appel reçu.")).toBe("Appel reçu.");
  });
});

describe("readCallReport (anciennes données)", () => {
  it("null / ancienne fiche sans compte rendu → null", async () => {
    const { readCallReport } = await import("./call-report");
    expect(readCallReport(null)).toBeNull();
    expect(readCallReport({ version: 2, actions: [] })).toBeNull();
  });
  it("compte rendu d'une version antérieure : champs ajoutés par défaut, actions invalides écartées", async () => {
    const { readCallReport } = await import("./call-report");
    const { work_request: _w, ...legacy } = parseCallAnalysis(BASE)!;
    void _w;
    const r = readCallReport({
      version: 1,
      analysis: legacy,
      actions: [{ type: "rendez_vous", status: "confirme_par_ia", label: "x" }, { type: "rendez_vous", status: "en_attente_validation", label: "mardi 9 h" }],
      humanValidation: ["Rappeler", 42],
      meta: {},
    });
    expect(r?.analysis?.work_request).toBe("aucun");
    expect(r?.actions).toHaveLength(1);
    expect(r?.humanValidation).toEqual(["Rappeler"]);
  });
});

describe("nom de l'appelant", () => {
  it("valeur de remplissage du modèle (« client », « appelant ») → null", () => {
    expect(parseCallAnalysis({ ...BASE, caller: { ...BASE.caller, name: "client" } })?.caller.name).toBeNull();
    expect(parseCallAnalysis({ ...BASE, caller: { ...BASE.caller, name: "Appelant" } })?.caller.name).toBeNull();
  });
});
