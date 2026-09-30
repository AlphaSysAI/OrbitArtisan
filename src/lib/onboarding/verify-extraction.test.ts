import { describe, expect, it } from "vitest";

import type { QuoteExtraction } from "./quote-import-schema";
import { inferVatRegime, mergeVerifiedDocuments, verifyExtraction } from "./verify-extraction";

const OCR = `# DUPONT PLOMBERIE
12 rue des Lilas — 11000 Carcassonne — Tél. 06 12 34 56 78
SIRET : 732 829 320 00074 — TVA intracom. FR44732829320 — RM 732829320 Aude
Assurance décennale : MAAF Pro, contrat n° DEC-4471-B, couverture France métropolitaine
| Désignation | Unité | PU HT | TVA |
| Pose WC suspendu | U | 380,00 | 10 % |
| Main d'œuvre plomberie | h | 45,00 | 10 % |
Paiement à 30 jours.`;

const f = (value: string | null, evidence: string | null, confidence: "high" | "low" = "high") => ({ value, evidence, confidence });
const none = f(null, null, "low");

function extraction(over: Partial<QuoteExtraction["company"]> = {}, ins: Partial<QuoteExtraction["insurance"]> = {}): QuoteExtraction {
  return {
    document_kind: "quote",
    readable: true,
    company: {
      business_name: f("DUPONT PLOMBERIE", "DUPONT PLOMBERIE"),
      siret: f("73282932000074", "SIRET : 732 829 320 00074"),
      vat_number: f("FR44732829320", "TVA intracom. FR44732829320"),
      vat_franchise_mention: none,
      trade_register: f("RM 732829320 Aude", "RM 732829320 Aude"),
      address_line1: f("12 rue des Lilas", "12 rue des Lilas"),
      postal_code: f("11000", "11000 Carcassonne"),
      city: f("Carcassonne", "11000 Carcassonne"),
      phone: f("06 12 34 56 78", "Tél. 06 12 34 56 78"),
      email: none,
      ...over,
    },
    insurance: {
      decennale_insurer: f("MAAF Pro", "Assurance décennale : MAAF Pro"),
      decennale_policy_number: f("DEC-4471-B", "contrat n° DEC-4471-B"),
      decennale_coverage_area: f("France métropolitaine", "couverture France métropolitaine"),
      rc_pro_insurer: none,
      rc_pro_number: none,
      ...ins,
    },
    mediator: { name: none, url: none },
    payment_terms_days: { value: 30, evidence: "Paiement à 30 jours.", confidence: "high" },
    lines: [
      { label: "Pose WC suspendu", unit: "U", unit_price_ht: 380, vat_rate: 10, evidence: "| Pose WC suspendu | U | 380,00 | 10 % |", confidence: "high" },
      { label: "Main d'œuvre plomberie", unit: "h", unit_price_ht: 45, vat_rate: 10, evidence: "| Main d'œuvre plomberie | h | 45,00 | 10 % |", confidence: "high" },
      { label: "Ligne inventée", unit: "U", unit_price_ht: 99, vat_rate: 20, evidence: "| Ligne inventée | U | 99,00 |", confidence: "high" },
    ],
  };
}

describe("verifyExtraction — zéro hallucination", () => {
  it("retient les valeurs prouvées par le texte", () => {
    const v = verifyExtraction(extraction(), OCR);
    expect(v.legal.siret).toEqual({ value: "73282932000074", status: "verified" });
    expect(v.legal.vat_number.value).toBe("FR44732829320");
    expect(v.legal.decennale_policy_number.value).toBe("DEC-4471-B");
    expect(v.legal.decennale_coverage_area.value).toBe("France métropolitaine");
    expect(v.legal.phone.value).toBe("0612345678");
    expect(v.legal.payment_terms_days.value).toBe("30");
    expect(v.legal.rc_pro_insurer.status).toBe("missing");
  });

  it("rejette une valeur dont la preuve n'existe pas dans le document", () => {
    const v = verifyExtraction(extraction({}, { rc_pro_insurer: f("AXA", "RC Pro : AXA") }), OCR);
    expect(v.legal.rc_pro_insurer).toEqual({ value: null, status: "unreadable" });
  });

  it("rejette une valeur absente de sa propre preuve (numéro « complété » par le modèle)", () => {
    const v = verifyExtraction(extraction({}, { decennale_policy_number: f("DEC-4471-BX", "contrat n° DEC-4471-B") }), OCR);
    expect(v.legal.decennale_policy_number.value).toBeNull();
  });

  it("rejette confidence low, SIRET à clé invalide et TVA incohérente", () => {
    const v = verifyExtraction(
      extraction({
        business_name: f("DUPONT PLOMBERIE", "DUPONT PLOMBERIE", "low"),
        siret: f("73282932000075", "SIRET : 732 829 320 00075"),
      }),
      OCR.replace("00074", "00075"),
    );
    expect(v.legal.business_name.status).toBe("unreadable");
    expect(v.legal.siret.status).toBe("invalid");
  });

  it("catalogue : seules les lignes au prix vérifié sont présélectionnées", () => {
    const v = verifyExtraction(extraction(), OCR);
    const byLabel = Object.fromEntries(v.lines.map((l) => [l.label, l]));
    expect(byLabel["Pose WC suspendu"]).toMatchObject({ unitPriceCents: 38000, vatRate: 10, selected: true });
    expect(byLabel["Ligne inventée"]!.selected).toBe(false);
  });

  it("fusion : deux devis en désaccord → conflit, pas de choix silencieux", () => {
    const a = verifyExtraction(extraction(), OCR);
    const ocrB = OCR.replace("DEC-4471-B", "DEC-9999-Z");
    const b = verifyExtraction(extraction({}, { decennale_policy_number: f("DEC-9999-Z", "contrat n° DEC-9999-Z") }), ocrB);
    const m = mergeVerifiedDocuments([a, b]);
    expect(m.legal.decennale_policy_number.status).toBe("conflict");
    expect(m.legal.decennale_policy_number.options).toEqual(["DEC-4471-B", "DEC-9999-Z"]);
    expect(m.legal.siret.status).toBe("verified");
    expect(m.lines.find((l) => l.label === "Pose WC suspendu")?.occurrences).toBe(2);
  });
});

describe("inferVatRegime — franchise 293 B", () => {
  const OCR_FR = `ARTISAN MARTIN\nSIRET : 732 829 320 00074\nTVA non applicable, art. 293 B du CGI\n| Pose porte | U | 250,00 |`;
  const franchiseDoc = () =>
    verifyExtraction(
      {
        ...extraction({ vat_number: none, vat_franchise_mention: f("TVA non applicable, art. 293 B du CGI", "TVA non applicable, art. 293 B du CGI") }),
        lines: [{ label: "Pose porte", unit: "U", unit_price_ht: 250, vat_rate: null, evidence: "| Pose porte | U | 250,00 |", confidence: "high" }],
      },
      OCR_FR,
    );

  it("mention 293 B vérifiée → franchise, lignes sans TVA", () => {
    const doc = franchiseDoc();
    expect(doc.vatFranchise).toBe(true);
    expect(inferVatRegime(mergeVerifiedDocuments([doc]))).toEqual({ value: "franchise", reason: "document" });
  });

  it("un devis en franchise + un devis avec TVA → on demande (changement de régime)", () => {
    const merged = mergeVerifiedDocuments([franchiseDoc(), verifyExtraction(extraction(), OCR)]);
    expect(inferVatRegime(merged)).toEqual({ value: null, reason: "conflict" });
  });

  it("mention 293 B citée mais absente du document → pas de franchise", () => {
    const doc = verifyExtraction(
      extraction({ vat_franchise_mention: f("TVA non applicable, art. 293 B du CGI", "TVA non applicable, art. 293 B du CGI") }),
      OCR,
    );
    expect(doc.vatFranchise).toBe(false);
  });
});
